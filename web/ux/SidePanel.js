// ============================================================================
// SidePanel.js - Panneau latéral d'information
//
// Elle permet d'afficher plus de détails sur l'élément en question.
// C'est un panneau dépliable et n'a pas de layout dédié contrairement aux
// autres UX.
//
// Le panneau d'information joue un rôle important dans les vues
// Infrastructure et Ressources, mais sert également de fallback pour Les
// autres vues.
// ============================================================================

window.SidePanel = {
    open(node) {
        const panel = document.getElementById("side-panel");
        if (!panel) return;

        panel.innerHTML = "";
        panel.classList.add("visible");

        // Titre
        const title = document.createElement("h2");
        title.textContent = node.label || node.id;
        panel.appendChild(title);

        // Type d'objet
        const type = document.createElement("div");
        type.className = "sidepanel-type";
        type.textContent = this.getTypeLabel(node);
        panel.appendChild(type);

        // Bloc d'informations selon le type
        const infoBlock = document.createElement("div");
        infoBlock.className = "sidepanel-info-block";

        const typeLabel = this.getType(node);

        // Pour chaque type défini dans ce code, il faudra les brancher ici
        // pour que le panneau d'information puisse s'afficher comme prévu.
        if (typeLabel === "identity") {
            this.renderIdentityInfo(infoBlock, node);
        }
        else if (typeLabel === "businessGroup") {
            this.renderBusinessGroupInfo(infoBlock, node);
        }
        else if (typeLabel === "technicalGroup") {
            this.renderTechnicalGroupInfo(infoBlock, node);
        }
        else if (typeLabel === "serviceAccount") {
            this.renderServiceAccountInfo(infoBlock, node);
        }
        else if (typeLabel === "ou") {
            this.renderOUInfo(infoBlock, node);
        }
        else if (typeLabel === "gpo") {
            this.renderGPOInfo(infoBlock, node);
        }
        else if (node.type === "share") {
            this.renderShareInfo(infoBlock, node);
        }
        else if (node.type === "shares-root") {
            this.renderSharesRootInfo(infoBlock, node);
        }
        else if (node.type === "dc-container") {
            this.renderDCContainerInfo(infoBlock, node);
        }
        else if (node.type === "server") {
            this.renderServerInfo(infoBlock, node);
        }

        panel.appendChild(infoBlock);

        // --- Boutons d'action ---
        const actionBar = document.createElement("div");
        actionBar.className = "sidepanel-actions";

        // Bouton fermer
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "Fermer";
        closeBtn.className = "sidepanel-close";
        closeBtn.addEventListener("click", () => this.close());
        panel.appendChild(closeBtn);
    },

    close() {
        const panel = document.getElementById("side-panel");
        if (!panel) return;
        panel.classList.remove("visible");
    },

    // -------------------------
    // Détection du type d'objet
    // -------------------------

    // Détecte le type d'un nœud à partir de son identifiant (préfixe) ou de ses métadonnées.
    // Si l'objet n'est pas identifié, le panneau d'information tombe dans le fallback "unknown".
    // Retour possible : "identity", "businessGroup", "technicalGroup", "serviceAccount",
    //                   "ou", "gpo", ou le type brut (ex: "share", "server", "dc-container")
    getType(node) {
        if (!node || !node.id) return node.type || "unknown";
        if (node.meta?.isServiceAccount) return "serviceAccount";
        if (node.id.startsWith("user-")) return "identity";
        if (node.id.startsWith("machine-")) return "identity";
        if (node.id.startsWith("bg-")) return "businessGroup";
        if (node.id.startsWith("tg-")) return "technicalGroup";
        if (node.id.startsWith("ou-")) return "ou";
        if (node.id === "orphan-gpos")  return "ou";
        if (node.id.startsWith("gpo-")) return "gpo";
        return "unknown";
    },

    // A partir des types techniques définis ci-dessus, on retourne un libellé visible et compréhensible par tout le monde
    // Le fallback : affichage du nom de l'objet tel quel
    getTypeLabel(node) {
        const type = this.getType(node);
        // Distinguer compte à privilèges du compte de service natif
        if (type === "serviceAccount" && node.meta?.isPrivileged) {
            return "Compte à privilèges";
        }
        return {
            identity: "Collaborateur",
            businessGroup: "Groupe métier",
            technicalGroup: "Groupe technique",
            ou: "Structure",
            gpo: "Politique de sécurité",
            resource: "Ressource",
            serviceAccount: "Compte de service",
            unknown: "Élément"
        }[type];
    },

    // A partir du statut de l'objet, on retourne un libellé de statut visible et compréhensible par tout le monde
    // Le fallback : affichage du statut de l'objet tel quel
    getStatusLabel(status) {
        return {
            active: "Actif",
            inactive: "Inactif",
            disabled: "Désactivé",
            invited: "Invité"
        }[status] || status;
    },

    // ----------------------------------------------------------------------------
    // Liste des points d'attention
    //
    // Il s'agit d'une définition en parrallèle des points d'attention relevés
    // pour chaque objet.
    // En cas de nouveau point d'attention, il faudra le définir en parrallèle ici
    // ----------------------------------------------------------------------------

    // Compte utilisateur (identité + service)
    // Particularité : Appel par renderIdentityInfo() et par showUserCard() dans dashboard-loader.js
    // En effet, une autre forme de panneau d'information est intégré dans le tableau de droite des vues Equipes & Collaborateurs et Accès technique
    // Le panneau latéral est laissé à titre de fallback en cas de problème avec le dashboard loader.
    getIdentityRisks(node) {
        const risks = [];

        if (node.meta?.passwordNeverExpires)
            risks.push("Mot de passe permanent (risque élevé)");

        if (!node.meta?.enabled)
            risks.push("Compte désactivé mais toujours présent");

        if (!node.meta?.lastLogon)
            risks.push("Compte jamais utilisé");

        if (node.label?.toLowerCase() === "administrateur")
            risks.push("Compte hautement sensible");

        return risks;
    },

    // Groupes métiers - Même scénario pour les comptes utilisateurs
    renderBusinessGroupInfo(container, node) {
        container.innerHTML += `<p style="font-size:13px; color:#6b7280;">
            Pour voir les membres et les accès de ce groupe, rendez-vous dans
            <strong>Équipes &amp; Collaborateurs</strong>.
        </p>`;
    },

    getBusinessGroupRisks(node) {
        const risks = [];

        if (node.meta?.memberCount === 0)
            risks.push("Groupe vide");

        if (node.meta?.coherence === "incoherent")
            risks.push("Membres incohérents avec l’équipe réelle");

        if (node.meta?.coherence === "obsolete")
            risks.push("Groupe obsolète");

        if (node.meta?.coherence === "critical")
            risks.push("Groupe critique");

        return risks;
    },

    // Groupes techniques - Idem groupes métiers
    renderTechnicalGroupInfo(container, node) {
        container.innerHTML += `<p style="font-size:13px; color:#6b7280;">
            Pour voir les membres et les accès de ce groupe, rendez-vous dans
            <strong>Accès techniques</strong>.
        </p>`;
        this.renderRisks(container, this.getTechnicalGroupRisks(node));
    },

    getTechnicalGroupRisks(node) {
        const risks = [];

        if (node.meta?.sensitivity === "sensitive")
            risks.push("Accès sensible");

        if (node.meta?.sensitivity === "large")
            risks.push("Groupe trop large");

        if (node.meta?.sensitivity === "orphan")
            risks.push("Groupe orphelin");

        if (node.meta?.memberCount > 50)
            risks.push("Trop de membres pour un droit d’accès");

        return risks;
    },

    // Comptes de service - parmi les comptes dits "utilisateurs", on applique
    // un statut "Compte de service" à la rencontre de la condition
    // isServiceAccount
    renderServiceAccountInfo(container, node) {
        const accName = (node.label || "").toLowerCase();
        const isKrbtgt  = accName.startsWith("krbtgt_");   // ← RODC Kerberos
        const isService = isKrbtgt                         // ← krbtgt_xxxxx = service par définition
                        || (acc.meta?.servicePrincipalName || []).length > 0
                        || typeof acc.meta?.servicePrincipalName === "string";

        const dn = escapeHtml(node.meta?.dn) || "";
        const cnMatch = dn.match(/^CN=([^,]+)/);
        const fullName = cnMatch ? cnMatch[1] : "";
        // Pour krbtgt, le nom complet = label, inutile de le répéter
        const showFullName = fullName && fullName.toLowerCase() !== accName;

        const lastLogon = node.meta?.lastLogon
            ? formatDateTime(node.meta.lastLogon)
            : "Jamais connecté";

        const pwdLastSet = node.meta?.passwordLastSet
            ? formatDateTime(node.meta.passwordLastSet)
            : "Jamais modifié";

        // SPN = c'est le nom du service principal du compte de service d'un domaine
        // Cette information est importante dans le fonctionnement d'une application
        const spnList = Array.isArray(node.meta?.servicePrincipalName)
            ? node.meta.servicePrincipalName.filter(Boolean)
            : [];

        const description = escapeHtml(node.meta?.description) || "";

        // Section krbtgt spécifique
        if (isKrbtgt) {
            container.innerHTML += `
                <h3>Rôle</h3>
                <div>Compte Kerberos du domaine — gère l'émission des tickets d'authentification.</div>

                <h3>Statut</h3>
                <div>${node.meta?.enabled === false
                    ? "Désactivé — état normal pour ce compte"
                    : "⚠ Activé — anomalie à signaler immédiatement à la direction informatique"
                }</div>

                ${spnList.length > 0
                    ? `<h3>Services liés à ce compte</h3>
                    <div style="font-family:monospace; font-size:12px; word-break:break-all;">
                        ${spnList.map(escapeHtml).join("<br>")}
                    </div>`
                    : "<h3>Services Kerberos (SPN)</h3><div>Aucun SPN défini</div>"
                }

                <h3>Dernier changement de mot de passe</h3>
                <div>${pwdLastSet}</div>
            `;
            // Pas de renderRisks pour krbtgt
            return;
        }

        // Section générale (tous les autres comptes de service)
        container.innerHTML += `
            ${showFullName ? `<h3>Nom complet</h3><div>${escapeHtml(fullName)}</div>` : ""}

            <h3>Identifiant</h3>
            <div>${escapeHtml(node.label)}</div>

            <h3>Statut</h3>
            <div>${this.getStatusLabel(node.meta?.status)}</div>

            ${description ? `<h3>Description</h3><div>${escapeHtml(description)}</div>` : ""}

            <h3>Groupes</h3>
            <div>${
                Array.isArray(node.meta?.groups) && node.meta.groups.length > 0
                ? node.meta.groups.map(escapeHtml).join(", ")
                : "Aucun groupe"
            }</div>

            <h3>Dernière connexion</h3>
            <div>${lastLogon}</div>

            <h3>Dernier changement de mot de passe</h3>
            <div>${pwdLastSet}</div>

            ${spnList.length > 0
                ? `<h3>Nom de service (SPN)</h3>
                <div style="font-family:monospace; font-size:12px; word-break:break-all;">
                    ${spnList.map(escapeHtml).join("<br>")}
                </div>`
                : ""}
        `;

        this.renderRisks(container, this.getServiceAccountRisks(node));
    },

    // Récupération des risques
    // Cette section est spécifique aux comptes de service
    getServiceAccountRisks(node) {
        const risks = [];
        const accName = (node.label || "").toLowerCase();

        if (accName === "krbtgt") return risks; // Compte krbtgt du domaine

        const isNativeAdmin = accName === "administrator" || accName === "administrateur";  // Compte admin du domaine

        // Mot de passe permanent : anomalie
        if (node.meta?.passwordNeverExpires && !isNativeAdmin)
            risks.push("Mot de passe permanent — risque élevé");

        // Compte de service - normal si désactivé
        const isServiceAccount = node.type === "serviceAccount"
            || (node.meta?.badges || []).includes("service");

        if (isServiceAccount) {
            if (node.meta?.enabled === false) {
                risks.push("⚠ Compte désactivé mais actif selon les services. Si vous remarquez l'absence du badge « Désactivé », il s'agit d'une anomalie à signaler.");
            } else if (node.meta?.enabled !== false) {
                risks.push("⚠ Compte activé. Or, ce compte n'est utilisé que par les services et non pour des connexions humaines.");
            }
        } else if (!isNativeAdmin && node.meta?.enabled === false) {
            // Compte admin désactivé - à vérifier
            risks.push("Compte désactivé — vérifier s'il peut être supprimé");
        }

        // Mot de passe - jamais changé où un mot de passe qui date de plus de 12 mois
        const pwdLastSet = node.meta?.passwordLastSet
            ? new Date(node.meta.passwordLastSet)
            : null;

        if (!pwdLastSet)
            risks.push("Mot de passe jamais changé");
        else {
            const monthsAgo = (Date.now() - pwdLastSet.getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (monthsAgo > 12)
                risks.push(`Mot de passe non changé depuis ${Math.floor(monthsAgo)} mois`);
        }

        return risks;
    },

    // Structure (OU)
    renderOUInfo(container, node) {
        // Cas spécial : conteneur des GPO non liées => on attribue une description personnalisée
        if (node.id === "orphan-gpos") {
            container.innerHTML += `
            <h3>Pourquoi elles apparaissent ici ?</h3>
            <div>Ces politiques de sécurité existent dans votre annuaire, mais elles ne sont appliquées à aucune structure. Concrètement, elles ne font rien : elles occupent de l'espace sans produire d'effet. Chaque politique listée ici devrait être soit liée à une structure active, soit supprimée.</div>
            `;
            return;
        }
        // Sinon, on récupère la position du noeud GPO
        const gpoLinked = node.meta?.gpoLinked || [];
        const location = this.formatDNForManager(escapeHtml(node.meta?.dn));

        // Et on l'affiche
        container.innerHTML += `
            ${location ? `<h3>Emplacement</h3><div>${location}</div>` : ""}
        `;

        // Alerte OU vide - le conteneur est déjà grisé, mais il faut en préciser la raison dans le panneau d'information
        if (node.meta?.empty || node.empty) {
            const warning = document.createElement("div");
            warning.style.cssText = "background:#FEF2F2; border-left:3px solid #EF4444; padding:10px 14px; border-radius:6px; margin-top:10px; font-size:13px; color:#991B1B;";
            warning.textContent = "⚠ Il se peut que cette structure ne soit plus utilisée. Si elle a encore son importance, la direction informatique doit la remplir avec les objets correspondants. Sinon, elle doit être supprimée.";
            container.appendChild(warning);
        }

        // Politiques de sécurité liées
        if (gpoLinked.length > 0) {
            container.innerHTML += `
                <h3>Politiques de sécurité</h3>
                <div>${gpoLinked.map(escapeHtml).join(", ")}</div>
            `;
        }

        // Membres directs : utilisateurs
        const users = node.users || [];
        if (users.length > 0) {
            container.innerHTML += `<h3>Utilisateurs (${users.length})</h3>`;
            const ul = document.createElement("ul");
            users.forEach(u => {
                const li = document.createElement("li");
                li.style.cssText = "padding: 2px 0; font-size: 13px;";
                const name = escapeHtml(u.label) || u.meta?.dn || "Inconnu";
                const logon = u.meta?.lastLogon
                    ? formatDateTime(u.meta.lastLogon)
                    : "jamais connecté";
                li.textContent = `${name} — ${logon}`;
                ul.appendChild(li);
            });
            container.appendChild(ul);
        }

        // Membres directs : groupes
        const groups = node.groups || [];
        if (groups.length > 0) {
            container.innerHTML += `<h3>Groupes (${groups.length})</h3>`;
            const ul = document.createElement("ul");
            groups.forEach(g => {
                const li = document.createElement("li");
                li.style.cssText = "padding: 2px 0; font-size: 13px;";
                li.textContent = escapeHtml(g.label) || "Inconnu";
                ul.appendChild(li);
            });
            container.appendChild(ul);
        }

        // Membres directs : machines
        const machines = node.machines || [];
        if (machines.length > 0) {
            container.innerHTML += `<h3>Ordinateurs (${machines.length})</h3>`;
            const ul = document.createElement("ul");
            machines.forEach(m => {
                const li = document.createElement("li");
                li.style.cssText = "padding: 2px 0; font-size: 13px;";
                const name = escapeHtml(m.label) || "Inconnu";
                const logon = m.meta?.lastLogon
                    ? formatDateTime(m.meta.lastLogon)
                    : "jamais connecté";
                li.textContent = `${name} — ${logon}`;
                ul.appendChild(li);
            });
            container.appendChild(ul);
        }
    },

    // Transforme un Distinguished Name AD en chemin lisible (ex: "Contoso > Paris > Support")
    // en ne conservant que les composants OU=, dans l'ordre hiérarchique (inverse du DN).
    formatDNForManager(dn) {
        if (!dn) return "Inconnu";

        const parts = dn.split(",")
            .filter(p => p.startsWith("OU="))
            .map(p => p.replace("OU=", ""))
            .reverse();

        return parts.join(" > ") || dn;
    },

   // Rendu des identités : utilisé à titre de fallback en l'absence du tableau de droite
   renderIdentityInfo(container, node) {
        const dn = escapeHtml(node.meta?.dn) || "";
        const cnMatch = dn.match(/^CN=([^,]+)/);
        const fullName = cnMatch ? cnMatch[1] : "";
        const location = this.formatDNForManager(dn);

        container.innerHTML += `
            ${fullName ? `<h3>Nom complet</h3><div>${escapeHtml(fullName)}</div>` : ""}

            <h3>Identifiant</h3>
            <div>${escapeHtml(node.label)}</div>
            ${escapeHtml(node.meta?.description) ? `<h3>Description</h3><div>${escapeHtml(node.meta.description)}</div>` : ""}

            <h3>Statut</h3>
            <div>${this.getStatusLabel(node.meta?.status)}</div>

            <h3>Emplacement</h3>
            <div>${location || "Non renseigné"}</div>

            <h3>Groupes</h3>
            <div>${
                Array.isArray(node.meta?.groups) && node.meta.groups.length > 0
                    ? node.meta.groups.map(escapeHtml).join(", ")
                    : "Aucun groupe"
            }</div>

            <h3>Dernière connexion</h3>
            <div>${
                node.meta?.lastLogon
                    ? formatDateTime(node.meta.lastLogon)
                    : "Jamais connecté"
            }</div>

            <h3>Dernier changement de mot de passe</h3>
            <div>${
                node.meta?.passwordLastSet
                    ? formatDateTime(node.meta.passwordLastSet)
                    : "Jamais modifié"
            }</div>
        `;

        this.renderRisks(container, this.getIdentityRisks(node));
    },

    // Politiques (GPO)
    renderGPOInfo(container, node) {
        // Détecter si la GPO est orpheline (non liée à une OU)
        // On le détecte via la présence ou non de liens dans les données
        const appliedTo = (node.meta?.appliedTo || []).join(", ")
            || node.linkedFrom
            || "Aucune structure";

        // Sinon, on dit où elle est appliquée
        container.innerHTML += `
            <h3>Appliquée sur</h3>
            <div>${appliedTo}</div>
        `;

        // node.linkedOUs peut être passé si disponible, sinon on affiche le badge générique
        if (node.orphan || (node.linkedOUs !== undefined && node.linkedOUs.length === 0)) {
            const warning = document.createElement("div");
            warning.style.cssText = "background:#FEF2F2; border-left:3px solid #EF4444; padding:10px 14px; border-radius:6px; margin-top:10px; font-size:13px; color:#991B1B;";
            warning.textContent = "⚠ Bien que définie dans le domaine, cette politique de sécurité n'a aucun effet. Selon son importance, elle peut être liée aux structures concernés. Sinon, elle doit être supprimée.";
            container.appendChild(warning);
        }
    },

    // Affichage des risques
    // Affiche les alertes en bas du panneau latéral.
    // Ne s'affiche pas si la liste est vide.
    renderRisks(container, risks) {
        if (risks.length === 0) return;

        const block = document.createElement("div");
        block.className = "sidepanel-risks";
        block.innerHTML = "<h3>Points d’attention</h3>";

        risks.forEach(r => {
            const item = document.createElement("div");
            item.className = "risk-item";
            item.textContent = "• " + r;
            block.appendChild(item);
        });

        container.appendChild(block);
    },

    // Affichage des info partages
    renderShareInfo(container, node) {
        const isInfra = window.location.pathname.includes("infrastructure");

        // Serveur et chemin — toujours affichés
        container.innerHTML += `
            <h3>Serveur</h3>
            <div>${escapeHtml(node.server || "Inconnu")}</div>
            <h3>Chemin</h3>
            <div>${escapeHtml(node.path || "—")}</div>
        `;

        if (isInfra) {
            // Vue Infrastructure : remplacer les permissions par un bouton qui redirige vers la vue Ressources
            const resourcesBtn = document.createElement("button");
            resourcesBtn.textContent = "Voir le détail des permissions dans Ressources →";
            resourcesBtn.style.cssText = `
                margin-top:10px; width:100%; padding:8px 12px;
                background:#f0fdf4; border:1px solid #86efac; border-radius:6px;
                color:#16a34a; font-size:13px; font-weight:600; cursor:pointer; text-align:left;
            `;
            resourcesBtn.addEventListener("click", () => {
                sessionStorage.setItem("graphad-search-target", JSON.stringify({
                    id:    node.id,
                    label: node.label,
                    view:  "resources"
                }));
                window.location.href = "resources.html";
            });
            container.appendChild(resourcesBtn);

        } else {
            // Depuis la recherche du dashboard ou directement dans la vue Ressources, on affiche les permissions normalement
            container.innerHTML += `
                <h3>Permissions</h3>
                <ul>
                    ${(node.permissions || [])
                        .map(p => `<li>${escapeHtml(String(p.group))} : ${escapeHtml(translateAccess(p.access))}</li>`)
                        .join("")}
                </ul>
            `;

            // Risques spécifiques au partage
            if (window.ResourceView?.getShareRisks) {
                const risks = ResourceView.getShareRisks(node);
                if (risks.length > 0) {
                    this.renderRisks(container, risks.map(r => r.text));
                }
            }

            // Bouton "Voir dans Infrastructure" — uniquement si le partage a un id
            if (node.id) {
                const infraBtn = document.createElement("button");
                infraBtn.textContent = "Voir la position dans la vue Infrastructure →";
                infraBtn.style.cssText = `
                    margin-top:14px; width:100%; padding:8px 12px;
                    background:#f0f4ff; border:1px solid #aac2ff; border-radius:6px;
                    color:#4A90D9; font-size:13px; font-weight:600; cursor:pointer; text-align:left;
                `;
                infraBtn.addEventListener("click", () => {
                    sessionStorage.setItem("graphad-search-target", JSON.stringify({
                        id:    node.id,
                        label: node.label,
                        view:  "infrastructure"
                    }));
                    window.location.href = "infrastructure.html";
                });
                container.appendChild(infraBtn);
            }
        }
    },

    // Affichage des serveurs de partage
    // Le conteneur dispose par ailleurs d'une description spécifique et explicite
    renderSharesRootInfo(container) {
        container.innerHTML += `
            <h3>À quoi ça sert ?</h3>
            <div>Un partage réseau est un dossier hébergé sur un serveur, accessible depuis les postes de travail. C'est ici que sont stockés les fichiers communs : documents de travail, logiciels, données métier…</div>

            <h3>Ce que vous voyez ici</h3>
            <div>Chaque serveur de partage est listé avec les dossiers qu'il met à disposition. Pour chaque dossier, vous pouvez consulter qui y a accès et avec quel niveau de droits.</div>

            <h3>Points de vigilance</h3>
            <div>La vue ressource peut signaler des anomalies de partages. Un partage sans aucune permission définie est signalé en rouge. Un partage accessible à tous les utilisateurs ou avec des droits trop larges est signalé en orange. Ces situations méritent une vérification par la direction informatique.</div>
        `;
    },

    // Rendu des informations de partage
    renderServerInfo(container, node) {
        // Combien de partages le serveur y dispose
        const shares = node.shares || [];
        container.innerHTML += `
            <h3>Serveur de partage</h3>
            <div>Ce serveur héberge ${shares.length} partage(s) réseau.</div>
        `;

        // Partages disponibles : on affiche la liste dans le panneau d'information
        if (shares.length > 0) {
            container.innerHTML += `<h3>Partages disponibles</h3>`;
            const ul = document.createElement("ul");
            shares.forEach(sh => {
                const li = document.createElement("li");
                li.style.cssText = "padding:4px 0; font-size:13px; color:#374151;";
                // Nom du partage — texte simple, sans hyperlien cliquable
                li.textContent = sh.label + (sh.path ? ` — ${sh.path}` : "");
                ul.appendChild(li);
            });
            container.appendChild(ul);

            // Lien vers la vue Ressources
            const note = document.createElement("div");
            note.style.cssText = "margin-top:10px; font-size:12px; color:#9ca3af;";
            note.textContent = "Les permissions sont consultables dans la vue Ressources.";
            container.appendChild(note);

            const resourcesBtn = document.createElement("button");
            resourcesBtn.textContent = "Voir le détail des permissions dans Ressources →";
            resourcesBtn.style.cssText = `
                margin-top:10px; width:100%; padding:8px 12px;
                background:#f0fdf4; border:1px solid #86efac; border-radius:6px;
                color:#16a34a; font-size:13px; font-weight:600; cursor:pointer; text-align:left;
            `;
            resourcesBtn.addEventListener("click", () => {
                // Stocker l'id du serveur — resources.html dépliera le bon bloc
                sessionStorage.setItem("graphad-search-target", JSON.stringify({
                    id:    node.id,
                    label: node.label,
                    view:  "resources"
                }));
                // Chemin relatif depuis infrastructure.html (dans views/)
                window.location.href = "resources.html";
            });
            container.appendChild(resourcesBtn);
        }
    },

    // Information de l'OU par défaut Domain Controllers
    // Là encore, on applique une description personnalisée et explicite
    renderDCContainerInfo(container, node) {
        container.innerHTML += `
            <h3>À quoi ça sert ?</h3>
            <div> Ce sont les serveurs qui font fonctionner l'annuaire de l'entreprise. Ils vérifient les identités, appliquent les règles de sécurité et synchronisent les informations entre eux.</div>
            
            <h3>Points de vigilance</h3>
            <div>Cette zone ne doit contenir que des serveurs ainsi que la politique par défaut. La présence d'utilisateurs, de groupes ou de structures métier ici est une anomalie à signaler à la direction informatique.</div>
        `;

        // On affiche un point d'attention en cas d'anomalie
        const anomalies = node.anomalies || [];
        const servers   = node.servers   || [];

        if (anomalies.length === 0) {
            container.innerHTML += `<h3>Aucune anomalie détectée.</h3>`;
        } else {
            container.innerHTML += `<h3>Anomalies</h3><ul>`;
            anomalies.forEach(a => container.innerHTML += `<li>${escapeHtml(a)}</li>`);
            container.innerHTML += `</ul>`;
        }

        // On fait la liste des contrôleurs de domaine existant
        container.innerHTML += `<h3>Contrôleurs de domaine détectés</h3><ul>`;
        servers.forEach(s => container.innerHTML += `<li>${escapeHtml(s.label)}</li>`);
        container.innerHTML += `</ul>`;
    }
};