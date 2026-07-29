/* =========================
   ÉVÊQUES EUROPE
   Moteur de recherche
========================= */

let database = [];

const searchInput = document.getElementById("search");

window.initSearch = function(data) {
    database = data;
    console.log("Recherche initialisée");
};

function normalize(text) {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\bst\b/g, "saint")
        .replace(/-/g, " ");
}

function scoreResult(item, query) {
    const q = normalize(query).trim();
    if (!q) return 0;
    let score = 0;

    // Champs de recherche avec pondération spécifique
    const primaryFields = [item.ville, item.diocese];
    const secondaryFields = [item.region, ...(item.departements || []), ...(item.grandes_villes || [])];

    if (item.eveque) {
        primaryFields.push(item.eveque.nom);
        secondaryFields.push(item.eveque.titre);
    }

    primaryFields.forEach(field => {
        if (!field) return;
        const val = normalize(field);
        if (val === q) score += 120;
        else if (val.startsWith(q)) score += 70;
        else if (val.includes(q)) score += 30;
    });

    secondaryFields.forEach(field => {
        if (!field) return;
        const val = normalize(field);
        if (val === q) score += 90;
        else if (val.startsWith(q)) score += 50;
        else if (val.includes(q)) score += 25;
    });

    // Support direct des numéros de départements (ex: "28", "69", "974")
    if (item.departements) {
        item.departements.forEach(dep => {
            const depCode = dep.split("-")[0].trim().toLowerCase();
            if (depCode === q) score += 150;
        });
    }

    if (score > 0 && item.pays === "France") {
        score += 10;
    }

    return score;
}

function search(query) {
    if (!query || query.trim().length < 1) {
        if (typeof displayResults === "function") {
            displayResults([]);
        }
        return;
    }

    const results = database
        .map(item => ({
            item,
            score: scoreResult(item, query)
        }))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 15);

    if (typeof displayResults === "function") {
        displayResults(results.map(result => result.item));
    }
}

searchInput.addEventListener("input", event => {
    search(event.target.value);
});

window.search = search;
