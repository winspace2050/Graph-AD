// ============================================================================
// ResourceView.js - Layout central de la vue Ressources
//
// Elle est basé sur infrastructure.servers[].shares[] et permet un déroulement
// Serveur → Partages → Permissions. 
// ============================================================================
window.ResourceView = {

    // Les valeurs d'accès aux partages sont traduits par utils.js
    translateAccess(val) {
        return translateAccess(val);
    },

    // Récupération des risques dans les partages
    // On utilise des critères prédéfinis
    getShareRisks(share) {
        const risks = [];
        // Les deux constantes définissent les groupes "admins" et "tout le monde"
        // Elle auront leur importance juste après
        const adminKeywords = ["admin", "administrateur", "administrator", "domain admins"];
        const everyoneKeywords = ["everyone", "tout le monde", "authenticated users", "utilisateurs authentifiés"];

        // Parcourt des partages pour extraire les groupes ayant accès et leurs permissions
        (share.permissions || []).forEach(p => {
            const group = String(p.group || "").toLowerCase();
            const access = String(p.access || "").toLowerCase();
            const accessLabel = translateAccess(p.access);

            // Permissions à tout le monde - anomalie
            if (everyoneKeywords.some(k => group.includes(k)))
                risks.push({ level: "warning", text: `Accès ouvert à tous : "${p.group}" — ${accessLabel}` });

            // Un accès trop permissif ouvert à un groupe non-admin du domaine : anomalie
            // Attention, cela concerne uniquement la permission "Contrôle total" définie dans iFullControll
            // Un groupe qui possède la permission lecture/écriture, ce n'est pas une anomalie
            const isFullControl = ["0", "full", "fullcontrol", "2032127", "genericall"]
                .some(v => access === v || access.includes(v));
            if (isFullControl && !adminKeywords.some(k => group.includes(k)))
                risks.push({ level: "warning", text: `Contrôle total accordé à "${p.group}" — à vérifier` });
        });

        // + de 10 groupes : trop d'accès
        if ((share.permissions || []).length > 10) {
            risks.push({ level: "warning", text: `Trop de groupes (${share.permissions.length}) — exposition potentielle` });
        }

        // Partage sans aucune permission = orphelin d'accès
        // On assignera un badge rouge au partage
        if ((share.permissions || []).length === 0) {
            risks.push({ level: "orphan", text: "Aucune permission définie — accès inconnu" });
        }

        return risks;
    },

    // Rendu des partages
    render(containerId, json) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = "";

        // --------------------------------------------------------------------
        // 1) Normalisation des données
        // --------------------------------------------------------------------
        // Etape 1 : on séurise l'accès aux serveurs
        // Concrètement, si un serveur n'a pas de partage, on renvoie un tableau vide ce qui évite un plantage
        const servers = Array.isArray(json.infrastructure?.servers)
            ? json.infrastructure.servers
            : [];

        // Etape 2 : chaque serveur est normalisé
        // On crée un nouvel objet avec toutes ses propriétés
        // On s'assure qu'un tableau vide est retourné si aucun partage n'est disponible
        const normalizedServers = servers.map(s => ({
            ...s,
            shares: Array.isArray(s.shares) ? s.shares : []
        }));

        // Etape 3 : Tous les partages seront réunis dans un seul et même tableau
        // Peu importe le serveur d'origine, on aura la liste complète de tous les partages de tous les serveurs
        const allShares = normalizedServers.flatMap(s => s.shares);

        // --------------------------------------------------------------------
        // 2) Gestion du cas où aucun partage n'est disponible dans le domaine
        // La vue centrale sera alors remplacée par un message pédagogique
        // --------------------------------------------------------------------
        if (allShares.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h2>Aucun partage détecté</h2>
                    <p>
                        Aucun partage n’a été trouvé dans l’infrastructure.
                        Si votre réseau ne contient pas de serveurs de fichiers,
                        cette situation est normale.
                    </p>
                </div>
            `;
            return;
        }

        // --------------------------------------------------------------------
        // 3) Construction de l’arborescence Serveur → Partages
        // La vue arborescente est différente de la vue Infrastructure
        // --------------------------------------------------------------------
        // Conteneur racine
        const tree = document.createElement("div");
        tree.className = "resources-tree";

        // On parcout la liste des serveurs qu'on avait normalisée auparavant
        normalizedServers.forEach(server => {

            // Bloc serveur
            const serverBlock = document.createElement("div");
            serverBlock.className = "resource-server-block";
            if (server.id) serverBlock.setAttribute("data-node-id", server.id);

            // Chaque serveur aura son propre conteneur dans la vue
            serverBlock.innerHTML = `
                <div class="resource-server-header">
                    <span class="server-name">${server.label}</span>
                    <span class="server-count">${server.shares.length} partage(s)</span>
                </div>
            `;

            // Liste des partages disponibles
            const sharesList = document.createElement("div");
            sharesList.className = "resource-shares-list";
            sharesList.style.display = "none";

            // Initialisation de la flèche d'expansion
            const header = serverBlock.querySelector(".resource-server-header");
            const arrow = document.createElement("span");
            arrow.textContent = "▶";
            arrow.style.marginRight = "8px";
            header.prepend(arrow);

            // Le listener gère alors la bascule
            header.addEventListener("click", () => {
                const isOpen = sharesList.style.display === "block";
                sharesList.style.display = isOpen ? "none" : "block";
                arrow.textContent = isOpen ? "▶" : "▼";
            });

            server.shares.forEach(share => {
                // Liste des partages
                const shareItem = document.createElement("div");
                shareItem.setAttribute("data-node-id", share.id);
                shareItem.className = "resource-share-item";
            
                // Calculer les risques selon son niveau de gravité
                // Certains risques autres que orphelins sont gérés par ../views/resources.html
                const risks = this.getShareRisks(share);
                const hasOrphan  = risks.some(r => r.level === "orphan");
                const hasWarning = risks.some(r => r.level === "warning");
                const riskClass  = hasOrphan ? "critical" : hasWarning ? "warning" : "ok";
                const riskDot    = `<span class="risk-dot ${riskClass}"
                    title="${risks.length > 0 ? risks.map(r => r.text).join(" | ") : "Aucun risque détecté"}"></span>`;
            
                // La liste des partages de chaque serveur seront insérés dans le DOM
                shareItem.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${riskDot}
                        <div style="display: flex; flex-direction: column;">
                            <span class="share-name">${share.label}</span>
                            <span style="font-size: 12px; color: #666; margin-top: 4px;">
                                ${share.path || `\\\\${server.label}\\${share.label}`}
                            </span>
                            ${risks.length > 0
                                ? `<span style="font-size:11px; color:${hasOrphan ? "#DC2626" : "#D97706"}; margin-top:3px;">
                                    ⚠ ${risks[0].text}${risks.length > 1 ? ` (+${risks.length-1})` : ""}
                                   </span>`
                                : ""}
                        </div>
                    </div>
                `;
            
                // Au click sur un partage, le panneau d'information s'ouvre avec :
                // - Nom du partage
                // - Serveur responsable du partage
                // - Chemin SMB dans le domaine
                // - Liste des permissions par groupe
                shareItem.addEventListener("click", () => {
                    SidePanel.open({
                        id:          share.id,
                        label:       share.label,
                        type:        "share",
                        path:        share.path,
                        permissions: share.permissions || [],
                        server:      server.label
                    });
                });
            
                sharesList.appendChild(shareItem);
            });

            serverBlock.appendChild(sharesList);
            tree.appendChild(serverBlock);
        });

        container.appendChild(tree);
    }
};