// ============================================================================
// PedagogyCard.js - à quoi sert la vue en question ?
//
// Elle décrit les objectifs de la vue, précise des informations de la carte
// introductive et permet de guider l'utilisateur dans la compréhension de la
// vue.
// La carte est présente dans le layout de gauche de chaque vue.
// ============================================================================

const PedagogyCard = {
    render({ text }) {
        // Absence de l'ID pedagogy-card dans le DOM : arrêt du script
        const el = document.getElementById("pedagogy-card");
        if (!el) return;

        // Rendu modèle pour chaque vue
        el.innerHTML = `
            <div class="pedagogy-card">
                <h3>Comment utiliser cette vue</h3>
                <p>${text}</p>
            </div>
        `;
    }
};