/* =========================
   ÉVÊQUES EUROPE
   Interface utilisateur
========================= */

const resultsContainer = document.getElementById("results");
const card = document.getElementById("diocese-card");

window.displayResults = function(items) {
    resultsContainer.innerHTML = "";

    if (!items.length) {
        return;
    }

    items.forEach(item => {
        const element = document.createElement("div");
        element.className = "result-item";

        element.innerHTML = `
            <div class="result-title">
                ${item.ville}
            </div>

            <div class="result-subtitle">
                ${item.diocese}
                ${
                    item.eveque
                    ? " • " + item.eveque.nom
                    : " • Siège vacant"
                }
            </div>
        `;

        element.addEventListener("click", () => {
            showDiocese(item);
        });

        resultsContainer.appendChild(element);
    });
};

function showDiocese(diocese) {
    card.classList.remove("hidden");

    document.getElementById("diocese-name").textContent = diocese.diocese;

    const bishop = diocese.eveque;
    const bishopName = document.getElementById("bishop-name");
    const bishopDate = document.getElementById("bishop-date");
    const bishopMotto = document.getElementById("bishop-motto");
    const image = document.getElementById("bishop-image");

    if (bishop) {
        bishopName.textContent = `${bishop.titre} ${bishop.nom}`;
        bishopDate.textContent = bishop.depuis ? "En fonction depuis le " + formatDate(bishop.depuis) : "";
        if (bishopMotto) {
            bishopMotto.textContent = bishop.devise ? `« ${bishop.devise} »` : "";
        }
        if (bishop.photo) {
            image.src = bishop.photo;
            image.alt = bishop.nom;
            image.style.display = "block";
            image.onerror = () => {
                image.style.display = "none";
            };
        } else {
            image.style.display = "none";
        }
    } else {
        bishopName.textContent = "Siège vacant";
        bishopDate.textContent = "Diocèse en attente de nomination";
        if (bishopMotto) bishopMotto.textContent = "";
        image.style.display = "none";
    }

    document.getElementById("province").textContent = diocese.province || "";
    document.getElementById("metropolitan").textContent = diocese.metropolitain || "";
    document.getElementById("region").textContent = diocese.region || "";

    const depsElem = document.getElementById("departements");
    if (depsElem) {
        depsElem.textContent = (diocese.departements || []).join(", ");
    }

    const villesElem = document.getElementById("grandes-villes");
    if (villesElem) {
        villesElem.textContent = (diocese.grandes_villes || []).join(" • ");
    }

    const liturgy = document.getElementById("liturgy");
    const liturgyText = document.getElementById("liturgy-text");

    liturgy.classList.remove("hidden");
    liturgyText.textContent = buildLiturgyMessage(diocese);

    const link = document.getElementById("diocese-link");

    if (diocese.site) {
        link.href = diocese.site;
        link.style.display = "block";
    } else {
        link.style.display = "none";
    }

    card.scrollIntoView({
        behavior: "smooth"
    });
}

function buildLiturgyMessage(diocese) {
    if (diocese.liturgie && diocese.liturgie.formule) {
        return diocese.liturgie.formule;
    }

    if (diocese.liturgie && diocese.liturgie.statut === "siege_vacant") {
        if (diocese.liturgie.administrateur) {
            return "Siège vacant. Formule à employer : « ... avec " + diocese.liturgie.administrateur + " »";
        }
        return "Siège vacant : Omettre la mention de l'évêque dans la Prière eucharistique.";
    }

    if (diocese.eveque && diocese.eveque.nom) {
        const prenom = diocese.eveque.nom.split(" ")[0];
        return `Dans la prière eucharistique, on dit : « ... avec ${prenom}, notre évêque »`;
    }

    return "Suivre les règles ordinaires du Missel Romain.";
}

function formatDate(dateStr) {
    if (!dateStr) return "";

    const parts = dateStr.split("-");
    if (parts.length === 3) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const months = [
            "janvier", "février", "mars", "avril", "mai", "juin",
            "juillet", "août", "septembre", "octobre", "novembre", "décembre"
        ];
        if (monthIndex >= 0 && monthIndex < 12) {
            return `${day} ${months[monthIndex]} ${year}`;
        }
    }

    return dateStr;
}
