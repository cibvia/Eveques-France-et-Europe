/* =========================
   ÉVÊQUES EUROPE
   Application principale
========================= */

let dioceses = [];

async function loadDatabase() {
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

    if (dioceses && dioceses.length > 0 && window.initSearch) {
        window.initSearch(dioceses);
    } else {
        console.error("Erreur critique : aucune donnée n'est disponible.");
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
});
