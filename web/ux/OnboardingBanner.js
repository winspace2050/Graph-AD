// ============================================================================
// OnboardingBanner.js - Banderole de bienvenue
// Elle s'affiche sur la page index lorsque la session Graph'AD est démarré.
// ============================================================================

const OnboardingBanner = {
    render(containerId) {
        // Absence du containerId : on n'affiche pas la banderole
        const el = document.getElementById(containerId);
        if (!el) return;

        // Lorsque l'utilisateur clique sur "J'ai compris", la banderole ne s'affichera plus
        // Il faudra attendre une nouvelle session pour la réafficher
        if (sessionStorage.getItem("graphad_onboarding") === "done") return;

        // Ici, on gère l'affichage de la banderole
        el.innerHTML = `
            <div class="onboarding-banner">
                <h2>Bienvenue sur Graph'AD</h2>
                <p>Cet outil vous permet de comprendre et contrôler les accès de vos collaborateurs.</p>

                <div class="onboarding-steps">
                    <a href="views/teams.html" class="onboarding-step">
                        <span class="step-number">1</span>
                        <span class="step-text">Vérifiez les <strong>équipes</strong></span>
                    </a>

                    <a href="views/tech-access.html" class="onboarding-step">
                        <span class="step-number">2</span>
                        <span class="step-text">Contrôlez les <strong>accès techniques</strong></span>
                    </a>

                    <a href="views/resources.html" class="onboarding-step">
                        <span class="step-number">3</span>
                        <span class="step-text">Identifiez les <strong>ressources</strong></span>
                    </a>
                </div>

                <button class="onboarding-dismiss" onclick="
                    sessionStorage.setItem('graphad_onboarding', 'done');
                    this.parentElement.remove();
                ">J'ai compris</button>
            </div>
        `;
    }
};