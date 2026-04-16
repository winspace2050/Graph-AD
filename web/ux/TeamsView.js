// ============================================================================
// TeamsView.js - Layout central de la vue Equipes & Collaborateurs
// Classification Groupes / Identité ainsi que détection des orphelins
// ============================================================================

window.TeamsView = {

    allIdentities: [],

    // --- Risque groupe métier ---
    getGroupRisk(group) {
        if (group.meta?.coherence === "bad" || group.meta?.coherence === "obsolete")
            return "critical";
        if ((group.meta?.members || []).length === 0)
            return "warning";
        return "ok";
    },

    // --- Tips pour les groupes selon le niveau de risque --
    getGroupTooltip(group) {
        const risk = this.getGroupRisk(group);
        const map = {
            critical: "Groupe incohérent ou obsolète. À vérifier.",
            warning: "Groupe vide. Aucun membre.",
            ok: "Groupe métier cohérent."
        };
        return map[risk] || "";
    },

    // --- Risque identité ---
    getIdentityRisk(user) {
        if (user.meta?.enabled === false) return "critical";
        if (!user.meta?.lastLogon) return "warning";
        return "ok";
    },

    // --- Tips pour les identités selon le niveau de risque --
    getIdentityTooltip(user) {
        const risk = this.getIdentityRisk(user);
        const map = {
            critical: "Compte désactivé mais toujours membre du groupe.",
            warning: "Compte jamais utilisé. Vérifiez sa légitimité.",
            ok: "Collaborateur actif."
        };
        return map[risk] || "";
    },

    // --- Nom complet de l'utilisateur ---
    extractFullName(user) {
        const dn = user.meta?.dn || "";
        const match = dn.match(/^CN=([^,]+)/);
        return match ? match[1] : user.label;
    },

    // --- Élément groupe (panneau gauche) ---
    createGroupItem(group) {
        const item = document.createElement("div");
        item.className = "business-group-item";

        const risk = this.getGroupRisk(group);;  // Badge de risque
        const memberCount = (group.meta?.members || []).length; // Combien de membres

        // Affichage
        item.setAttribute("title", this.getGroupTooltip(group));
        item.innerHTML = `
            <span class="risk-dot ${risk}"></span>
            <div class="group-title">${escapeHtml(group.label)}</div>
            <div class="group-meta">${memberCount} membre(s)</div>
        `;

        item.addEventListener("click", () => {
            window.currentTeamGroup = group;   // mémorise le groupe actif
            this.renderMembers("team-members", group);
        });
        item.setAttribute("data-node-id", group.id);
        return item;
    },

    // --- Élément membre (panneau central) ---
    createMemberItem(user) {
        const item = document.createElement("div");
        item.className = "identity-item";
    
        const risk     = this.getIdentityRisk(user);        // Risques utilisateur
        const fullName = this.extractFullName(user);        // Nom complet
        const status   = user.meta?.status || "inconnu";    // Statut si connu
        // Dernière connexion
        const lastLogon = user.meta?.lastLogon
            ? formatDateTime(user.meta.lastLogon)
            : "Jamais connecté";
    
        // Affichage
        item.setAttribute("title", this.getIdentityTooltip(user));
        item.innerHTML = `
            <span class="risk-dot ${risk}"></span>
            <div style="flex:1;">
                <div class="member-name">${escapeHtml(fullName)}</div>
                <div class="member-meta">Statut : ${status} · Connexion : ${lastLogon}</div>
            </div>
        `;
    
        item.addEventListener("click", () => {
            // Si showUserCardInline est disponible (vue Équipes), l'utiliser
            if (typeof showUserCardInline === "function") {
                showUserCardInline(user);
            } else {
                SidePanel.open(user);
            }
        });
        item.setAttribute("data-node-id", user.id);
        return item;
    },

    // --- Affichage des membres d’un groupe ---
    renderMembers(containerId, group) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = "";

        const title = document.createElement("h3");
        title.style.cssText = "margin-bottom:12px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;";

        const titleText = document.createElement("span");
        titleText.textContent = `Membres de ${group.label}`;
        title.appendChild(titleText);

        // Bouton de redirection vers la vue Infrastructure
        const infraBtn = document.createElement("button");
        infraBtn.textContent = "Voir la position dans la vue Infrastructure →";
        infraBtn.style.cssText = "font-size:11px; color:#4A90D9; background:#f0f4ff; border:1px solid #aac2ff; border-radius:6px; padding:3px 8px; cursor:pointer; font-weight:600;";
        infraBtn.addEventListener("click", () => {
            sessionStorage.setItem("graphad-search-target", JSON.stringify({
                id:    group.id,
                label: group.label,
                view:  "infrastructure"
            }));
            // Le chemin dépend d'où on est appelé — teams.html est dans views/
            window.location.href = "infrastructure.html";
        });
        title.appendChild(infraBtn);
        container.appendChild(title);

        const memberIds = group.meta?.members || [];

        // Groupe vide -> on informe et on applique le badge adéquat
        if (memberIds.length === 0) {
            container.innerHTML += '<div class="empty">Aucun membre dans ce groupe.</div>';
            return;
        }

        // Séparer sous-groupes et utilisateurs
        const subGroupIds = memberIds.filter(id =>
            id.startsWith("bg-") ||
            id.startsWith("tg-") ||
            id.startsWith("group-")
        );

        const userIds = memberIds.filter(id => !subGroupIds.includes(id));

        // Sous-groupes
        if (subGroupIds.length > 0) {
            // On affiche le nombre de sous-groupes
            const subTitle = document.createElement("div");
            subTitle.style.cssText =
                "font-size: 13px; color: #8B5CF6; font-weight: 600; margin: 8px 0 4px;";
            subTitle.textContent = `${subGroupIds.length} sous-groupe(s) :`;
            container.appendChild(subTitle);

            subGroupIds.forEach(id => {
                // On identifie le groupe comme étant un groupe imbriqué
                const div = document.createElement("div");
                div.className = "identity-item";
                div.style.borderLeft = "3px solid #8B5CF6";
                div.style.cursor = "pointer";

                // Et on l'affiche explicitement
                // Le badge appliqué est violet en suivant la légende
                div.innerHTML = `
                    <div class="member-name">${id.replace(/^bg-/, "").replace(/^tg-/, "")}</div>
                    <div class="member-meta">Groupe imbriqué</div>
                `;

                div.addEventListener("click", () => {
                    const found = window._cachedGroups?.find(g => g.id === id);
                    // le groupe est dans la liste : on affiche les détails
                    if (found) {
                        SidePanel.open(found);
                    } else {
                        // fallback si jamais le groupe n'est pas dans la liste
                        SidePanel.open({
                            id,
                            label: id.replace(/^bg-|^tg-/, ""),
                            meta: {}
                        });
                    }
                });

                container.appendChild(div);
            });
        }

        // Utilisateurs
        const members = userIds
            .map(id => this.allIdentities.find(u => u.id === id))
            .filter(Boolean)
            .filter(m =>
                m.meta?.isMachine !== true &&
                m.meta?.isServiceAccount !== true &&
                (m.label || "").toLowerCase() !== "invité" &&
                (m.label || "").toLowerCase() !== "guest"
            )

        // Nombre de collaborateurs dans chaque groupe
        if (members.length > 0) {
            const userTitle = document.createElement("div");
            userTitle.style.cssText =
                "font-size: 13px; color: #4A90D9; font-weight: 600; margin: 12px 0 4px;";
            userTitle.textContent = `${members.length} collaborateur(s) :`;
            container.appendChild(userTitle);
        }

        //  On définit la limite d'affichage du nombre d'utilisateurs (en l'occurence, 20)
        const MAX_VISIBLE = 20;
        const visible = members.slice(0, MAX_VISIBLE);
        visible.forEach(m => container.appendChild(this.createMemberItem(m)));

        // L'objectif est liée dans les performances et la practicité
        // On limite alors l'affichage au nombre d'utilisateurs défini dans MAX_VISIBLE
        // On laisse le choix d'afficher les X utilisateurs restants cachés par défaut
        if (members.length > MAX_VISIBLE) {
            const btn = document.createElement("button");
            btn.className = "show-more-btn";
            btn.textContent = `Afficher les ${members.length - MAX_VISIBLE} membres restants`;
            btn.addEventListener("click", () => {
                btn.remove();
                members.slice(MAX_VISIBLE).forEach(m =>
                    container.appendChild(this.createMemberItem(m))
                );
            });
            container.appendChild(btn);
        }
    },

    // --- Rendu principal ---
    render(containerId, groups, identities, orphans = []) {
        window._cachedGroups = groups || [];
        this.allIdentities = identities || [];

        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";

        // Aucun groupe métier trouvé : message explicite
        if (!groups || groups.length === 0) {
            container.innerHTML = '<div class="empty">Aucun groupe métier trouvé.</div>';
            return;
        }

        // Limite d'affichage du nombre de groupes (en l'occurence, 20)
        // Le fonctionnement est rigoureusement identique, mais il concerne les groupes
        const MAX_VISIBLE = 20;
        const visible = groups.slice(0, MAX_VISIBLE);
        visible.forEach(g => container.appendChild(this.createGroupItem(g)));

        if (groups.length > MAX_VISIBLE) {
            const btn = document.createElement("button");
            btn.className = "show-more-btn";
            btn.textContent = `Afficher les ${groups.length - MAX_VISIBLE} groupes restants`;

            btn.addEventListener("click", () => {
                btn.remove();
                groups.slice(MAX_VISIBLE).forEach(g =>
                    container.appendChild(this.createGroupItem(g))
                );
            });

            container.appendChild(btn);
        }

        // Détection des orphelins
        
        if (orphans.length > 0) {
            const orphanSection = document.createElement("div");
            orphanSection.style.cssText = "margin-top: 16px; border-top: 2px dashed #F59E0B; padding-top: 12px;";

            // On indique le nombre de comptes orphelins sans groupe
            const orphanTitle = document.createElement("div");
            orphanTitle.style.cssText = "font-size: 13px; color: #D97706; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;";
            orphanTitle.innerHTML = `⚠️ ${orphans.length} collaborateur(s) sans groupe`;
            orphanSection.appendChild(orphanTitle);

            // Affichage des informations du compte orphelin
            // A noter que le badge affiché est orange
            orphans.forEach(u => {
                if (u.meta?.isServiceAccount) return;
                const item = document.createElement("div");
                item.className = "identity-item";
                item.setAttribute("data-node-id", u.id);
                item.style.borderLeft = "3px solid #F59E0B";

                // Récupération de la dernière connexion - spécifier si le compte
                // ne s'est jamais connecté
                const lastLogon = u.meta?.lastLogon
                    ? formatDateTime(u.meta.lastLogon)
                    : "Jamais connecté";
                const fullName = this.extractFullName(u);
                item.innerHTML = `
                    <span class="risk-dot warning"></span>
                    <div>
                        <div class="member-name">${fullName}</div>
                        <div class="member-meta">Statut : ${u.meta?.status || "inconnu"} · Connexion : ${lastLogon}</div>
                    </div>
                `;
                item.addEventListener("click", () => SidePanel.open(u));
                orphanSection.appendChild(item);
            });

            container.appendChild(orphanSection);
        }
    }
};