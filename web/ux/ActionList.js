// ====================================================================================================
// ActionList.js - Carte actions recommandés
//
// A partir du diagnostic, afficher les actions recommandés à effectuer dans l'Active Directory.
// Les actions recommandés sont prédéfinies dans chaque vue (consulter le dossier views).
// La carte est présente dans le layout de droite de chaque vue.
// ====================================================================================================

const ActionList = {
    render(actions) {
        // L'ID action-list doit exister dans la page HTML où elle est appelée
        // Sinon, le JavaScript s'arrête d'exécuter
        const el = document.getElementById("action-list");
        if (!el) return;

        // Le paramètre actions reçoit null, undefined ou rien du tout
        // Dans ce cas, il n'y a aucune action nécessaire qui est demandée
        if (!actions || actions.length === 0) {
            el.innerHTML = `
                <div class="action-list">
                    <h3>Actions recommandées</h3>
                    <p class="no-actions">Aucune action nécessaire</p>
                </div>
            `;
            return;
        }

        // Chaque couleur = son niveau de priorité
        const colorMap = {
            high: "#DC2626",    // Priorité élevée
            medium: "#F59E0B",  // Priorité moyenne
            low: "#4A90D9"      // Priorité faible
        };

        // On génère et on affiche les actions 
        // selon les définitions ci-dessus
        el.innerHTML = `
            <div class="action-list">
                <h3>Actions recommandées</h3>
                ${actions
                    .map(a => `
                        <div class="action-item"
                             style="border-left:3px solid ${colorMap[a.priority] || "#999"};
                                    padding:8px 12px; margin-bottom:8px;">
                            ${a.text}
                        </div>
                    `)
                    .join("")}
            </div>
        `;
    }
};

window.ActionList = ActionList;