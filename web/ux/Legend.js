// ============================================================================================
// Legend.js - Légende personnalisée pour chaque vue
//
// Elle permet une association couleur / critère pour rendre les éléments "visuels".
// La carte est présente dans le layout de gauche de chaque vue.
// ============================================================================================

const Legend = {
    /**
     * Affiche la légende
     * @param {Array<Object>} items - Éléments de la légende
     * @param {string} items[].color - Couleur (nom CSS ou code hex)
     * @param {string} items[].label - Label descriptif
     */
    render(items) {
        const el = document.getElementById("legend");
        
        // Absence de #legend dans le DOM : avertissement dans la console du navigateur
        // On arrête le script au passage 
        if (!el) {
            console.warn("[UX] Legend: élément #legend non trouvé dans le DOM");
            return;
        }

        // S'il n'y a pas de légende à afficher, on ne retourne rien et on quitte le script
        // + avertissement dans la console du navigateur
        if (!items || !Array.isArray(items) || items.length === 0) {
            console.warn("[UX] Legend: aucun élément à afficher");
            el.innerHTML = '';
            return;
        }

        // Construction de la liste
        const list = items.map(item => {
            // Une légende invalide (couleur ou définition) entraine
            // un avertissement dans la console du navigateur ainsi
            // qu'un arrêt du script
            if (!item.color || !item.label) {
                console.warn("[UX] Legend: élément invalide", item);
                return '';
            }
            // Sinon, on fait le rendu de legend-item
            return `
                <div class="legend-item">
                    <span class="legend-color" style="background: ${item.color}"></span>
                    <span class="legend-label">${item.label}</span>
                </div>
            `;
        }).join('');

        // Rendu final
        el.innerHTML = `
            <div class="legend">
                <h3>Légende</h3>
                <div class="legend-items">
                    ${list}
                </div>
            </div>
        `;

    }
};
