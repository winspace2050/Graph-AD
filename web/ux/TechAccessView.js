// ============================================================================
// TechAccessView.js - Layout central de la vue Accès techniques
// Classification Groupes / Comptes de service et détection des risques
// ============================================================================

window.TechAccessView = {

    allAccounts: [],

    // --- Risque groupe technique ---
    getRiskLevel(group) {
        // Sécurité : si group est null/undefined, on considère "ok"
        if (!group || typeof group !== "object") {
            return "ok";
        }

        const name = (group.label || "").toLowerCase();

        // --- Comptes intégrés critiques (Administrateur par défaut) ---
        if (name === "administrator" || name === "administrateur") {
            return "critical";
        }

        // --- Groupes critiques (AD natifs ou renommés) ---
        const criticalPatterns = [
            "domain admins",
            "administrateurs du domaine",
            "admins du domaine",
            "enterprise admins",
            "administrateurs de l’entreprise",
            "schema admins",
            "administrateurs du schéma",
            "gg_admins_domaine",
            "g_admins_domaine"
        ];

        if (criticalPatterns.some(p => name.includes(p))) {
            return "critical";
        }

        // --- Groupes à privilèges (puissants mais normaux) ---
        const privilegedPatterns = [
            "administrateurs",
            "administrators",
            "backup operators",
            "server operators",
            "account operators",
            "opérateurs",
            "gg_admins",
            "g_admins"
        ];

        if (privilegedPatterns.some(p => name.includes(p))) {
            return "warning";
        }

        return "ok";
    },

    // --- Informe l'utilisateur que l'élément nécessite une surveillance ---
    getTooltip(group) {
        const risk = this.getRiskLevel(group);
        const map = {
            critical: "Groupe très sensible (admins du domaine). Contrôle strict nécessaire.",
            warning: "Groupe à privilèges élevés. À surveiller.",
            ok: "Groupe technique standard."
        };
        return map[risk] || "";
    },

    // --- Élément groupe (panneau gauche) ---
    createGroupItem(group) {
        const item = document.createElement("div");
        item.setAttribute("data-node-id", group.id);
        item.className = "technical-group-item";

        const risk = this.getRiskLevel(group);
        // Risque propre au compte (ex : Administrateur intégré)

        const members = (group.meta?.members || []).length;

        item.setAttribute("title", this.getTooltip(group));
        item.innerHTML = `
            <span class="risk-dot ${risk}"></span>
            <div class="group-title">${escapeHtml(group.label)}</div>
            <div class="group-meta">${members} membre(s)</div>
        `;

        item.addEventListener("click", () => {
            window.currentTechGroup = group;
            this.renderMembers("tech-members", group);
        });

        return item;
    },

    // --- Élément membre (panneau central) ---
    createMemberItem(acc, parentGroup) {
        const item = document.createElement("div");
        item.setAttribute("data-node-id", acc.id);
        item.className = "identity-item";

        const accName = (acc.label || "").toLowerCase();
        const isKrbtgt = accName === "krbtgt";
        const isNativeAdmin = accName === "administrator" || accName === "administrateur";
        // Un compte ayant un SPN est un compte de service
        const hasSPN = (acc.meta?.servicePrincipalName || []).length > 0
            || typeof acc.meta?.servicePrincipalName === "string";

        // Niveau de risque
        let risk = "ok";
        if (parentGroup && typeof parentGroup === "object") {
            risk = this.getRiskLevel(parentGroup);
        }
        if (acc.meta?.isPrivileged) risk = "warning";
        if (isNativeAdmin) risk = "critical";

        // Statut
        const status = acc.meta?.status || "inconnu";
        const lastLogon = acc.meta?.lastLogon
            ? formatDateTime(acc.meta.lastLogon)
            : "Jamais connecté";
        const pwdLastSet = acc.meta?.passwordLastSet
            ? formatDateTime(acc.meta.passwordLastSet)
            : "Inconnu";

        // Badge SPN
        const spnBadge = hasSPN
            ? `<span style="font-size:11px; background:#EDE9FE; color:#7C3AED; padding:1px 6px; border-radius:8px; margin-left:6px;">Service</span>`
            : "";

        // Détails sur le compte de service
        item.innerHTML = `
            <span class="risk-dot ${risk}"></span>
            <div style="flex:1;">
                <div class="member-name">${escapeHtml(acc.label)}${spnBadge}</div>
                <div class="member-meta">
                    ${isKrbtgt ? "Compte Kerberos du domaine" : `Statut : ${status}`}
                    · Connexion : ${lastLogon}
                </div>
            </div>
        `;

        // Affichage du compte de service dans le tableau de droite
        item.addEventListener("click", () => {
            if (typeof showServiceAccountCardInline === "function") {
                showServiceAccountCardInline(acc);
            } else {
                // Sinon, fallback sur le panneau d'information
                SidePanel.open(acc);
            }
        });
        return item;
    },

    // --- Affichage des membres d’un groupe ---
    renderMembers(containerId, group) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = "";

        const title = document.createElement("h3");
        title.textContent = `Membres de : ${group.label}`;
        title.style.marginBottom = "12px";
        container.appendChild(title);

        const memberIds = group.meta?.members || [];

        // Un groupe vide - l'afficher explicitement
        if (memberIds.length === 0) {
            container.innerHTML += '<div class="empty">Aucun membre.</div>';
            return;
        }

        const members = memberIds
            .map(id => this.allAccounts.find(a => a.id === id))
            .filter(Boolean);

        // Limite du nombre d'utilisateurs affichés (en l'occurence, 20 au maximum)
        const MAX_VISIBLE = 20;
        const visible = members.slice(0, MAX_VISIBLE);

        visible.forEach(m => container.appendChild(this.createMemberItem(m, group)));

        // En fait, c'est une question de performance et de lisibilité. On limite le nombre de membres affichés pour éviter de faire un effet "surcharge".
        // L'utilisateur peut décider d'afficher les X membres restants
        if (members.length > MAX_VISIBLE) {
            const btn = document.createElement("button");
            btn.className = "show-more-btn";
            btn.textContent = `Afficher les ${members.length - MAX_VISIBLE} restants`;

            btn.addEventListener("click", () => {
                btn.remove();
                members.slice(MAX_VISIBLE).forEach(m =>
                    container.appendChild(this.createMemberItem(m, group))
                );
            });

            container.appendChild(btn);
        }
    },

    // --- Rendu principal ---
    render(containerId, groups, allAccounts) {
        this.allAccounts = allAccounts || [];

        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = "";

        // Pas de groupes trouvés : on l'affiche explicitement
        if (!groups || groups.length === 0) {
            container.innerHTML = '<div class="empty">Aucun groupe technique trouvé.</div>';
            return;
        }

        // Tri par criticité
        const sorted = [...groups].sort((a, b) => {
            const order = { critical: 0, warning: 1, ok: 2 };
            return (order[this.getRiskLevel(a)] || 2) - (order[this.getRiskLevel(b)] || 2);
        });

        // Limite du nombre de groupes affichés (en l'occurence, 20)
        const MAX_VISIBLE = 20;
        const visible = sorted.slice(0, MAX_VISIBLE);

        visible.forEach(g => container.appendChild(this.createGroupItem(g)));

        // C'est rigoureusement le même fonctionnement que pour les utilisateurs, mais elle concerne cette fois ci les groupes
        if (sorted.length > MAX_VISIBLE) {
            const btn = document.createElement("button");
            btn.className = "show-more-btn";
            btn.textContent = `Afficher les ${sorted.length - MAX_VISIBLE} groupes restants`;

            btn.addEventListener("click", () => {
                btn.remove();
                sorted.slice(MAX_VISIBLE).forEach(g =>
                    container.appendChild(this.createGroupItem(g))
                );
            });

            container.appendChild(btn);
        }
    }
};