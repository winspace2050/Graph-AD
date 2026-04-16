// ============================================================================
// IntroCard.js - Carte introductive
//
// Carte introductive personnalisée qui permet de présenter la vue.
// La carte est présente dans le layout de gauche de chaque vue.
// ============================================================================

const IntroCard = {
    /**
     * Affiche la carte d'introduction
     * @param {Object} params - Paramètres
     * @param {string} params.title - Titre principal
     * @param {string} params.subtitle - Sous-titre
     * @param {string} params.text - Description détaillée
     */
    render({ title, subtitle, text }) {
        const el = document.getElementById("intro-card");
       
        // Absence de l'ID intro-card dans le DOM : avertissement dans la console du navigateur
        // On arrête le script au passage
        if (!el) {
            console.warn("[UX] IntroCard: élément #intro-card non trouvé dans le DOM");
            return;
        }

        // Absence de titre : la vue ne possède donc pas de titre
        // + avertissement dans la console du navigateur
        if (!title) {
            console.error("[UX] IntroCard: paramètre 'title' manquant");
            title = "Vue sans titre";
        }

        // Rendu de la carte
        el.innerHTML = `
            <div class="intro-card">
                <h1>${title}</h1>
                ${subtitle ? `<h2>${subtitle}</h2>` : ''}
                ${text ? `<p>${text}</p>` : ''}
            </div>
        `;
    }
};
