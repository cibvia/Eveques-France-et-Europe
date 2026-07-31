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

const USER_AGENT =
    "EvequesFranceEuropeBot/1.0 (+https://github.com/cibvia/Eveques-France-et-Europe; " +
    "usage non commercial ; mise a jour hebdomadaire ; contact via GitHub issues)";

const REQUEST_DELAY_MS = 1500;

const MONTHS = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
};

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

    if (bishopsSectionMatch) {
        const section = bishopsSectionMatch[1];
        const roleRegex =
            /([A-ZÀ-Þ][\p{L}'’.\- ]{3,80}?),\s*(Cardinal Archbishop|Cardinal Bishop|Archbishop Emeritus|Bishop Emeritus|Auxiliary Bishop|Coadjutor Archbishop|Coadjutor Bishop|Apostolic Administrator|Archbishop|Bishop)/gu;
        let match;
        while ((match = roleRegex.exec(section)) !== null) {
            const [, rawName, role] = match;
            const name = rawName.trim();

            if (/Auxiliary|Emeritus|Coadjutor/.test(role)) continue;

            if (/Apostolic Administrator/.test(role)) {
                if (!administrateur) administrateur = name;
                continue;
            }

            eveque = { nom: name, titre: role };
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

    return { type, site, region, eveque, administrateur };
}

async function main() {
    const staticData = JSON.parse(await fs.readFile(STATIC_PATH, "utf8"));
    const results = [];
    let updated = 0;
    let failed = 0;

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

            base.type = info.type ?? base.type;
            base.site = info.site ?? base.site;
            base.region = info.region ?? base.region;

            if (info.eveque) {
                base.eveque = {
                    nom: info.eveque.nom,
                    titre: info.eveque.titre,
                    depuis: info.eveque.depuis ?? null,
                    // photo et devise ne sont pas disponibles sur catholic-hierarchy.org :
                    // on conserve celles déjà connues si le nom de l'évêque n'a pas changé.
                    photo:
                        entry.eveque_fallback && entry.eveque_fallback.nom === info.eveque.nom
                            ? entry.eveque_fallback.photo
                            : undefined,
                    devise:
                        entry.eveque_fallback && entry.eveque_fallback.nom === info.eveque.nom
                            ? entry.eveque_fallback.devise
                            : undefined
                };
                delete base.liturgie;
                console.log(`OK — ${info.eveque.nom}`);
            } else {
                delete base.eveque;
                base.liturgie = info.administrateur
                    ? { statut: "siege_vacant", administrateur: info.administrateur }
                    : { statut: "siege_vacant" };
                console.log("OK — siège vacant");
            }

            updated++;
        } catch (err) {
            console.log(`échec (${err.message}) — valeurs précédentes conservées`);
            failed++;
        }

        results.push(base);
        await sleep(REQUEST_DELAY_MS);
    }

    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2) + "\n", "utf8");
    console.log(`\n${results.length} diocèses écrits dans data/dioceses.json`);
    console.log(`${updated} mis à jour depuis catholic-hierarchy.org, ${failed} échecs (valeurs conservées).`);
}

main().catch(err => {
    console.error("Erreur fatale :", err);
    process.exit(1);
});
