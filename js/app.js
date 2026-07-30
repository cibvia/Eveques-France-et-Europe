/* =========================
   ÉVÊQUES EUROPE
   Application principale
========================= */

// Source distante utilisée par le bouton de mise à jour : le fichier de données
// est mis à jour directement dans le dépôt GitHub, chaque utilisateur peut ensuite
// tirer la dernière version sans avoir à réinstaller l'application.
const REMOTE_DATA_URL = "https://raw.githubusercontent.com/cibvia/Eveques-France-et-Europe/main/data/dioceses.json";

// Doit rester identique au CACHE_NAME défini dans service-worker.js
const CACHE_NAME = "eveques-europe-v2";

const STORAGE_KEY = "dioceses_data";
const STORAGE_DATE_KEY = "dioceses_updated_at";

let dioceses = [];

async function loadDatabase() {
    const cached = getCachedData();

    if (cached && cached.length > 0) {
        dioceses = cached;
        console.log(`${dioceses.length} diocèses chargés depuis la mise à jour locale`);
        finalizeLoad();
        return;
    }

    try {
        const response = await fetch("./data/dioceses.json");
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        dioceses = await response.json();
        console.log(`${dioceses.length} diocèses chargés via fetch (dioceses.json)`);
    } catch (error) {
        console.warn("Erreur chargement dioceses.json via fetch, tentative demo.json :", error);
        try {
            const demoResp = await fetch("./data/demo.json");
            if (demoResp.ok) {
                dioceses = await demoResp.json();
                console.log(`${dioceses.length} diocèses chargés via demo.json`);
            }
        } catch (e) {
            console.warn("Erreur fetch demo.json, tentative de fallback local :", e);
        }

        if ((!dioceses || dioceses.length === 0) && (window.diocesesData || window.demoData)) {
            dioceses = window.diocesesData || window.demoData;
            console.log(`${dioceses.length} diocèses chargés via le fallback local window`);
        }
    }

    finalizeLoad();
}

function finalizeLoad() {
    if (dioceses && dioceses.length > 0 && window.initSearch) {
        window.initSearch(dioceses);
    } else {
        console.error("Erreur critique : aucune donnée n'est disponible.");
    }
    updateLastUpdateLabel();
}

function getCachedData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.warn("Erreur lecture du cache local :", e);
        return null;
    }
}

function updateLastUpdateLabel() {
    const label = document.getElementById("last-update");
    if (!label) return;

    const savedAt = localStorage.getItem(STORAGE_DATE_KEY);
    if (savedAt) {
        const date = new Date(savedAt);
        const jour = date.toLocaleDateString("fr-FR");
        const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        label.textContent = `Dernière mise à jour : ${jour} à ${heure}`;
    } else {
        label.textContent = "Base fournie avec l'application • Jamais mise à jour en ligne";
    }
}

async function updateDatabase() {
    const button = document.getElementById("update-button");
    const status = document.getElementById("update-status");

    if (button) {
        button.disabled = true;
        button.textContent = "⏳";
    }
    if (status) {
        status.textContent = "";
        status.classList.remove("error", "success");
    }

    try {
        const url = `${REMOTE_DATA_URL}?t=${Date.now()}`;
        const response = await fetch(url, { cache: "no-store" });

        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const data = await response.json();

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Données reçues invalides ou vides");
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        localStorage.setItem(STORAGE_DATE_KEY, new Date().toISOString());

        dioceses = data;
        if (window.initSearch) window.initSearch(dioceses);

        await refreshServiceWorkerCache(data);

        if (status) {
            status.textContent = `✅ ${data.length} diocèses mis à jour avec succès.`;
            status.classList.add("success");
        }
    } catch (error) {
        console.error("Erreur lors de la mise à jour :", error);
        if (status) {
            status.textContent = "❌ Échec de la mise à jour. Vérifiez votre connexion et réessayez.";
            status.classList.add("error");
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "🔄";
        }
        updateLastUpdateLabel();
    }
}

// Met aussi à jour le cache hors-ligne du service worker, pour que la nouvelle
// version des données reste disponible même sans connexion.
async function refreshServiceWorkerCache(data) {
    if (!("caches" in window)) return;
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = new Response(JSON.stringify(data), {
            headers: { "Content-Type": "application/json" }
        });
        await cache.put("./data/dioceses.json", response);
    } catch (e) {
        console.warn("Impossible de mettre à jour le cache hors-ligne :", e);
    }
}

function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("./service-worker.js")
            .then(() => {
                console.log("Mode hors ligne activé");
            })
            .catch(error => {
                console.error("Erreur service worker :", error);
            });
    }
}

document.addEventListener("DOMContentLoaded", () => {
    registerServiceWorker();
    loadDatabase();

    const updateButton = document.getElementById("update-button");
    if (updateButton) {
        updateButton.addEventListener("click", updateDatabase);
    }
});
