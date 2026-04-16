// ============================================================================================
// DiagnosticCard.js - Carte diagnostic / point d'attention
//
// Etablit la liste des anomalies présent dans l'Active Directory.
// Les diagnostics sont prédéfinies dans chaque vue (consulter le dossier views).
// La carte est présente dans le layout de droite de chaque vue.
// ============================================================================================

window.DiagnosticCard = {
    render({ label, issues = [] }) {
        // On vérifie si le container diagnostic-card existe
        // Sinon, le JavaScript s'arrête d'exécuter
        const container = document.getElementById("diagnostic-card");
        if (!container) return;

        container.innerHTML = "";   // Réinitialisation du contenu
        // On crée la carte
        const card = document.createElement("div");
        card.className = "diagnostic-card";

        // Titre de la carte
        card.innerHTML += `<h3>${label || "Points d'attention"}</h3>`;

        // Si aucun problème n'est détecté, le diagnostic affiche aucune anomalie
        if (issues.length === 0) {
            card.innerHTML += '<p style="color: #10B981;">✓ Aucune anomalie détectée</p>';
        } else {
            // Pour les problèmes présents un div est créé
            // Chaque couleur dépend du niveau de gravité de l'anomalie
            // Un style card et un fond clair est défini
            // Le texte du problème est sécurisée contre les injections XSS
            const list = document.createElement("div");
            issues.forEach(issue => {
                const item = document.createElement("div");
                item.style.cssText = `
                    padding: 8px; margin: 6px 0;
                    border-left: 3px solid ${
                        issue.level === "danger" ? "#EF4444" :
                        issue.level === "warning" ? "#F59E0B" : "#3B82F6"
                    };
                    background: #f9fafb; border-radius: 4px;
                `;
                item.textContent = issue.text;
                list.appendChild(item);
            });
            card.appendChild(list);
        }

        // Injection dans le DOM
        container.appendChild(card);
    }
};