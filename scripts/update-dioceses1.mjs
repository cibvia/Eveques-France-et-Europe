/* =========================================================
   ÉVÊQUES EUROPE — Mise à jour automatique de la base
   =========================================================

   Ce script :
   1. Lit data/dioceses-static.json (infos qui ne changent presque
      jamais : villes, départements, province, code de la fiche
      catholic-hierarchy.org, etc.)
   2. Va chercher sur catholic-hierarchy.org, pour chaque diocèse,
      les infos qui changent (évêque en poste, date de nomination,
      site officiel du diocèse).
   3. Fusionne le tout et écrit data/dioceses.json.
   4. Compare avec la version précédente et n'annonce que les
      VRAIS changements d'évêque (pas les échecs de scraping).

   Ce script est conçu pour tourner via GitHub Actions
   (.github/workflows/update-dioceses.yml), de façon planifiée,
   afin que personne n'ait besoin d'éditer dioceses.json à la main.

   Politesse envers catholic-hierarchy.org (petit site tenu par un
   particulier, David M. Cheney) :
   - un User-Agent identifiable est envoyé,
   - une pause d'1,5s est respectée entre deux requêtes,
   - le script ne tourne qu'une fois par semaine (voir le workflow),
   - seules des informations factuelles (nom de l'évêque, date de
     nomination, site du diocèse) sont reprises ; aucune page n'est
     republiée telle quelle.
========================================================= */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_PATH = path.join(__dirname, "..", "data", "dioceses-static.json");
const OUTPUT_PATH = path.join(__dirname, "..", "data", "dioceses.json");
const SUMMARY_PATH = path.join(__dirname, "..", "data", "update-summary.md");

const USER_AGENT =
    "EvequesFranceEuropeBot/1.0 (+https://github.com/cibvia/Eveques-France-et-Europe; " +
    "usage non commercial ; mise a jour hebdomadaire ; contact via GitHub issues)";

const REQUEST_DELAY_MS = 1500;

const MONTHS = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
};

// Rôles reconnus comme "évêque en exercice" (on ignore auxiliaires/émérites/coadjuteurs)
const ROLE_ALTERNATION =
    "Cardinal Archbishop|Cardinal Bishop|Archbishop Emeritus|Bishop Emeritus|" +
    "Auxiliary Bishop|Coadjutor Archbishop|Coadjutor Bishop|Apostolic Administrator|" +
    "Archbishop|Bishop";

// Entre le nom et le rôle, catholic-hierarchy.org insère parfois l'abréviation
// de la congrégation religieuse du titulaire, séparée par une virgule :
// "Jean-Marc Micas, P.S.S., Bishop of Tarbes..." ou
// "Raymond de Felgar, O.P., Bishop of ...".
// On l'absorbe explicitement pour ne pas la capturer à la place du nom.
const CONGREGATION_TOKEN = "[\\p{L}.''\\-]{1,15}";
const OPTIONAL_CONGREGATION = `(?:${CONGREGATION_TOKEN}(?:\\s+${CONGREGATION_TOKEN}){0,2},\\s*)?`;

const NAME_ROLE_REGEX = new RegExp(
    `([A-ZÀ-Þ][\\p{L}'’.\\- ]{2,80}?),\\s*${OPTIONAL_CONGREGATION}(${ROLE_ALTERNATION})`,
    "gu"
);

// Signal explicite de vacance sur catholic-hierarchy.org (à ne pas confondre
// avec un simple échec de parsing du nom).
const EXPLICIT_VACANCY_REGEX = /\bSee\s+is\s+Vacant\b/i;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseChDate(text) {
    // "26 Apr 2022" -> "2022-04-26"
    const m = text.trim().match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
    if (!m) return null;
    const [, day, monAbbr, year] = m;
    const month = MONTHS[monAbbr];
    if (!month) return null;
    return `${year}-${month}-${day.padStart(2, "0")}`;
}

async function fetchDiocesePage(slug) {
    const url = `https://www.catholic-hierarchy.org/diocese/${slug}.html`;
    const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT }
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} pour ${url}`);
    }
    return await response.text();
}

/**
 * Extrait les informations dynamiques d'une page diocèse catholic-hierarchy.org.
 * Basé sur l'analyse du texte visible de la page (assez stable dans le temps),
 * plutôt que sur des sélecteurs CSS précis (le site est un générateur statique
 * ancien, sans classes CSS descriptives).
 *
 * Retourne toujours un champ `parseStatus` :
 *   - "ok"            : évêque trouvé normalement
 *   - "vacant"        : vacance CONFIRMÉE explicitement par la page
 *   - "parse_failed"  : aucun nom n'a pu être extrait, mais rien n'indique
 *                        non plus une vraie vacance -> à ne PAS écraser
 *                        automatiquement, il vaut mieux garder la valeur
 *                        précédente et le signaler.
 */
function extractDioceseInfo(html) {
    const $ = cheerio.load(html);
    const bodyText = $("body").text().replace(/[ \t]+/g, " ").replace(/\n+/g, "\n").trim();

    const typeMatch = bodyText.match(
        /Type of Jurisdiction:\s*([A-Za-zÀ-ÿ ]+?)(?=\n|Elevated|Erected|Metropolitan|Depends on|Rite:|Country:)/
    );
    const type = typeMatch ? typeMatch[1].trim() : null;

    const siteMatch = bodyText.match(/Official Web Site:\s*<?(https?:\/\/[^\s>]+)>?/);
    const site = siteMatch ? siteMatch[1].replace(/[.,)]+$/, "") : null;

    const regionMatch = bodyText.match(
        /Conference Region:\s*([A-Za-zÀ-ÿ'’()., -]+?)(?=\n|Official Web Site|Mailing Address|Square Kilometers)/
    );
    const region = regionMatch ? regionMatch[1].trim() : null;

    // Section "Bishop(s)" : liste des titulaires actuels, auxiliaires et émérites,
    // avant la section "Suffragan Dioceses" ou "General Information".
    const bishopsSectionMatch = bodyText.match(
        /Bishop\(s\)([\s\S]*?)(?:Suffragan Dioceses|General Information)/
    );

    let eveque = null;
    let administrateur = null;
    let parseStatus = "parse_failed";

    if (bishopsSectionMatch) {
        const section = bishopsSectionMatch[1];

        if (EXPLICIT_VACANCY_REGEX.test(section)) {
            parseStatus = "vacant";
        }

        NAME_ROLE_REGEX.lastIndex = 0;
        let match;
        while ((match = NAME_ROLE_REGEX.exec(section)) !== null) {
            const [, rawName, role] = match;
            const name = rawName.trim();

            if (/Auxiliary|Emeritus|Coadjutor/.test(role)) continue;

            if (/Apostolic Administrator/.test(role)) {
                if (!administrateur) administrateur = name;
                continue;
            }

            eveque = { nom: name, titre: role };
            parseStatus = "ok";
            break;
        }
    }

    if (eveque) {
        // Cherche la date de nomination dans "Past and Present Ordinaries"
        // (la dernière ligne pour ce nom, sans date de fin, se termine par "- )")
        const escaped = eveque.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const dateRegex = new RegExp(
            escaped + "[^()]{0,40}\\((\\d{1,2} [A-Za-z]{3} \\d{4}) (?:Appointed|Succeeded|Confirmed)\\s*-\\s*\\)"
        );
        const dateMatch = bodyText.match(dateRegex);
        if (dateMatch) {
            eveque.depuis = parseChDate(dateMatch[1]);
        }
    }

    return { type, site, region, eveque, administrateur, parseStatus };
}

async function main() {
    const staticData = JSON.parse(await fs.readFile(STATIC_PATH, "utf8"));

    // Version précédente, pour calculer le vrai diff (pas juste "fetch réussi").
    let previousById = new Map();
    try {
        const previous = JSON.parse(await fs.readFile(OUTPUT_PATH, "utf8"));
        previousById = new Map(previous.map(d => [d.id, d]));
    } catch {
        // Premier run, pas de fichier précédent : tout sera considéré "nouveau".
    }

    const results = [];
    let fetched = 0;
    let failed = 0;
    let parseFailures = [];
    let realAppointments = []; // vrais changements d'évêque
    let realVacancies = [];    // vraies nouvelles vacances confirmées

    for (const entry of staticData) {
        const base = {
            id: entry.id,
            ville: entry.ville,
            diocese: entry.diocese,
            type: entry.type,
            pays: entry.pays,
            province: entry.province,
            metropolitain: entry.metropolitain,
            region: entry.region,
            departements: entry.departements,
            grandes_villes: entry.grandes_villes,
            site: entry.site
        };

        const previous = previousById.get(entry.id);

        if (entry.eveque_fallback) base.eveque = entry.eveque_fallback;
        if (entry.liturgie_fallback) base.liturgie = entry.liturgie_fallback;

        if (!entry.chSlug) {
            console.warn(`[ignoré] ${entry.id} : pas de chSlug catholic-hierarchy.org, valeurs conservées`);
            results.push(base);
            continue;
        }

        process.stdout.write(`Récupération : ${entry.diocese} (${entry.chSlug})... `);
        try {
            const html = await fetchDiocesePage(entry.chSlug);
            const info = extractDioceseInfo(html);
            fetched++;

            base.type = info.type ?? base.type;
            base.site = info.site ?? base.site;
            base.region = info.region ?? base.region;

            if (info.parseStatus === "ok" && info.eveque) {
                base.eveque = {
                    nom: info.eveque.nom,
                    titre: info.eveque.titre,
                    depuis: info.eveque.depuis ?? null,
                    // photo et devise ne sont pas disponibles sur catholic-hierarchy.org :
                    // on conserve celles déjà connues si le nom de l'évêque n'a pas changé.
                    photo:
                        entry.eveque_fallback && entry.eveque_fallback.nom === info.eveque.nom
                            ? entry.eveque_fallback.photo
                            : previous?.eveque?.nom === info.eveque.nom
                                ? previous.eveque.photo
                                : undefined,
                    devise:
                        entry.eveque_fallback && entry.eveque_fallback.nom === info.eveque.nom
                            ? entry.eveque_fallback.devise
                            : previous?.eveque?.nom === info.eveque.nom
                                ? previous.eveque.devise
                                : undefined
                };
                delete base.liturgie;
                console.log(`OK — ${info.eveque.nom}`);

                const previousNom = previous?.eveque?.nom;
                const previousDepuis = previous?.eveque?.depuis;
                const isRealChange =
                    previous !== undefined &&
                    (previousNom !== info.eveque.nom || previousDepuis !== (info.eveque.depuis ?? null)) &&
                    !previous?.liturgie?.statut; // ignore les sorties de "vacant" déjà traitées séparément
                if (previous === undefined || previousNom !== info.eveque.nom) {
                    if (previousNom && previousNom !== info.eveque.nom) {
                        realAppointments.push({
                            id: entry.id,
                            diocese: entry.diocese,
                            ancien: previousNom,
                            nouveau: info.eveque.nom,
                            depuis: info.eveque.depuis
                        });
                    } else if (previous?.liturgie?.statut === "siege_vacant") {
                        realAppointments.push({
                            id: entry.id,
                            diocese: entry.diocese,
                            ancien: "(siège vacant)",
                            nouveau: info.eveque.nom,
                            depuis: info.eveque.depuis
                        });
                    }
                }
            } else if (info.parseStatus === "vacant") {
                delete base.eveque;
                base.liturgie = info.administrateur
                    ? { statut: "siege_vacant", administrateur: info.administrateur }
                    : { statut: "siege_vacant" };
                console.log("OK — siège vacant (confirmé)");

                if (previous?.eveque?.nom) {
                    realVacancies.push({ id: entry.id, diocese: entry.diocese, ancien: previous.eveque.nom });
                }
            } else {
                // parse_failed : on ne sait pas si c'est vacant ou juste un échec
                // de lecture -> on GARDE la valeur précédente plutôt que de
                // basculer à tort sur "vacant".
                if (previous?.eveque) {
                    base.eveque = previous.eveque;
                } else if (previous?.liturgie) {
                    base.liturgie = previous.liturgie;
                }
                parseFailures.push(entry.id);
                console.log("⚠ échec de lecture du nom — valeurs précédentes conservées");
            }
        } catch (err) {
            console.log(`échec (${err.message}) — valeurs précédentes conservées`);
            failed++;
            if (previous?.eveque) base.eveque = previous.eveque;
            else if (previous?.liturgie) base.liturgie = previous.liturgie;
        }

        results.push(base);
        await sleep(REQUEST_DELAY_MS);
    }

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2) + "\n", "utf8");

    // --- Résumé exact pour la notification / la PR ---
    const lines = [];
    if (realAppointments.length === 0 && realVacancies.length === 0) {
        lines.push("Aucun changement d'évêque détecté cette semaine.");
    } else {
        if (realAppointments.length > 0) {
            lines.push(`### ${realAppointments.length} nomination(s) détectée(s)`);
            for (const c of realAppointments) {
                lines.push(`- **${c.diocese}** : ${c.ancien} → **${c.nouveau}**${c.depuis ? ` (depuis ${c.depuis})` : ""}`);
            }
        }
        if (realVacancies.length > 0) {
            lines.push(`### ${realVacancies.length} nouveau(x) siège(s) vacant(s)`);
            for (const v of realVacancies) {
                lines.push(`- **${v.diocese}** : ${v.ancien} → siège vacant`);
            }
        }
    }
    if (parseFailures.length > 0) {
        lines.push("");
        lines.push(`⚠ ${parseFailures.length} diocèse(s) non parsable(s) cette semaine (valeurs précédentes conservées, à vérifier manuellement) : ${parseFailures.join(", ")}`);
    }
    const summary = lines.join("\n") + "\n";
    await fs.writeFile(SUMMARY_PATH, summary, "utf8");

    console.log(`\n${results.length} diocèses traités, ${fetched} pages récupérées, ${failed} échecs réseau.`);
    console.log(`${realAppointments.length} vrai(s) changement(s) d'évêque, ${realVacancies.length} nouvelle(s) vacance(s) confirmée(s), ${parseFailures.length} échec(s) de parsing.`);

    // Pour piloter la PR depuis le workflow (titre, "y a-t-il un vrai changement ?")
    if (process.env.GITHUB_OUTPUT) {
        const changesCount = realAppointments.length + realVacancies.length;
        await fs.appendFile(
            process.env.GITHUB_OUTPUT,
            `changes_count=${changesCount}\nparse_failures=${parseFailures.length}\n`,
            "utf8"
        );
    }
}

main().catch(err => {
    console.error("Erreur fatale :", err);
    process.exit(1);
});
