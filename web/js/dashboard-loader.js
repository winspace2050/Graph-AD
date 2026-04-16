// ================================================================================
// dashboard-loader.js - Dashboard Graph'AD (index.html)
//
// Responsabilités :
//   1. Afficher les tuiles de navigation vers les quatre vues
//   2. Construire l'index MiniSearch sur les collaborateurs uniquement
//   3. Gérer la barre de recherche et afficher la fiche de chemin utilisateur
// ================================================================================

document.addEventListener("DOMContentLoaded", () => {
    const grid  = document.getElementById("score-grid");
    const input = document.getElementById("search-input");

    // --- Tuiles de navigation ---
    const views = [
        { name: "teams",          label: "Équipes & Collaborateurs", description: "Organisation des équipes et identités" },
        { name: "tech-access",    label: "Accès techniques",         description: "Groupes techniques et comptes de service" },
        { name: "infrastructure", label: "Infrastructure",           description: "Organisation technique de l'annuaire" },
        { name: "resources",      label: "Ressources",               description: "Serveurs de fichiers et partages" }
    ];

    views.forEach(view => {
        const card = document.createElement("div");
        card.className = "score-card clickable";
        card.setAttribute("data-view", view.name);
        card.style.borderLeft = "4px solid #4A90D9";
        card.innerHTML = `<h3>${view.label}</h3><p>${view.description}</p>`;
        card.addEventListener("click", () => {
            window.location.href = `views/${view.name}.html`;
        });
        grid.appendChild(card);
    });

    // --- Chargement du JSON chiffré et construction de l'index ---
    const invoke = window.__TAURI__?.core?.invoke
            ?? window.__TAURI__?.invoke
            ?? (() => Promise.reject("Tauri indisponible"));

    loadActiveFile()
    .then(json => {
            
        const isGuest = s => { const n = normStr(s); return n === "invite" || n === "guest" || n === "invites" || n === "guests"; };

        // =============================================================
        // INDEX MINISEARCH
        // Index limité aux collaborateurs, groupes métiers et
        // comptes admins — le reste est accessible directement depuis
        // les tuiles.
        // La barre de recherche sert à tracer immédiatement le chemin
        // utilisateur.
        // =============================================================
        const miniSearch = new MiniSearch({
            fields: ["fullName", "samAccount", "badge"],
            storeFields: ["fullName", "samAccount", "badge", "targetView", "targetId"],
            searchOptions: {
                prefix: true,
                fuzzy: 0.2,
                boost: { fullName: 2 }
            }
        });

        // userMap : association _id MiniSearch → objet identité complet du JSON (avec meta)
        // Nécessaire car MiniSearch ne stocke que les champs déclarés dans storeFields.
        // Construction directe pendant le push — O(n), sans refilter le tableau.
        let docId = 0;
        const searchDocs = [];
        const navMap = new Map(); // _id → { view, action }

        // Utilitaire : ajouter un document à l'index
        function addDoc(fullName, samAccount, badge, targetView, obj, action) {
            const _id = ++docId;
            searchDocs.push({ id: _id, fullName, samAccount, badge, targetView });
            navMap.set(_id, { view: targetView, obj, action });
        }

        // Note : pour chaque section (selon le type d'objet AD), on en profite pour définir les filtres.
        // Bien que cela soit déjà effectué côté Rust, on garanti une double vérification pour éviter de retrouver les objets dans des vues non souhaités.
        // En cas de modification des filtres côté Rust, il est recommandé de les appliquer en parallèle ici.

        // --- Identités (collaborateurs) ---
        // Exclure les machines (postes, serveurs AD) et les comptes de service
        (json.business?.identities || []).forEach(i => {
            if (i.meta?.isServiceAccount || i.meta?.isMachine) return;
            if (isGuest(i.label)) return;
            const dn       = i.meta?.dn || "";
            const fullName = (dn.match(/^CN=([^,]+)/) || [])[1] || i.label;
            addDoc(fullName, i.label, "Identité", "Équipes & Collaborateurs", i, { type: "user", id: i.id });
        });

        // --- Groupes métiers ---
        (json.business?.groups || []).forEach(g => {
            if (isGuest(g.label)) return;
            addDoc(g.label, g.label, "Groupe métier", "Équipes & Collaborateurs", g, { type: "group", id: g.id });
        });

        // --- Les objets privilèges du domaine ---
        const criticalPatterns = [
            "domain admins", "administrateurs du domaine", "admins du domaine",
            "enterprise admins", "administrateurs de l'entreprise",
            "schema admins", "administrateurs du schéma",
            "gg_admins_domaine", "g_admins_domaine"
        ];
        const privilegedPatterns = [
            "administrateurs", "administrators", "backup operators",
            "server operators", "account operators", "opérateurs",
            "gg_admins", "g_admins"
        ];
        // --- Groupes techniques ---
        (json.technical?.groups || []).forEach(g => {
            if (isGuest(g.label)) return;
            const name   = (g.label || "").toLowerCase();
            const isCrit = criticalPatterns.some(p => name.includes(p));
            const isPriv = privilegedPatterns.some(p => name.includes(p));
            const badge  = isCrit ? "Groupe Administrateur" : isPriv ? "Groupe Administrateur" : "Groupe technique";
            const view   = (isCrit || isPriv) ? "Accès techniques" : "Accès techniques";
            addDoc(g.label, g.label, badge, view, g, { type: "techGroup", id: g.id, isCrit, isPriv });
        });

        // --- Comptes de service ---
        (json.business?.identities || []).forEach(i => {
            if (!i.meta?.isServiceAccount) return;
            if (isGuest(i.label)) return;
            const dn       = i.meta?.dn || "";
            const fullName = (dn.match(/^CN=([^,]+)/) || [])[1] || i.label;
            const name     = (i.label || "").toLowerCase();

            // Comptes système par défaut (Administrateur, krbtgt) → badge Administrateur
            // Les patterns vérifient le nom au singulier ET pluriel
            const defaultAdminNames = ["administrator", "administrateur"];
            const isAdminAccount = i.meta?.isPrivileged
                || defaultAdminNames.includes(name)
                || criticalPatterns.some(p => name.includes(p))
                || privilegedPatterns.some(p => name.includes(p));

            const badge = isAdminAccount ? "Administrateur" : "Service";
            addDoc(fullName, i.label, badge, "Accès techniques", i, { type: "serviceAccount", id: i.id });
        });

        // --- Structures (OU) ---
        (json.structure?.nodes || []).forEach(n => {
            if (!n.label) return;
            const dn = n.meta?.dn || "";
            // Construire le chemin lisible depuis le DN
            const path = dn.split(",")
                .filter(p => p.startsWith("OU="))
                .map(p => p.replace("OU=", ""))
                .reverse().join(" › ");
            const samAccount = path ? `${n.label} — ${path}` : n.label;
            addDoc(n.label, samAccount, "Structure", "Infrastructure", n, { type: "ou", id: n.id });
        });

        // --- Politiques de sécurité (GPO) ---
        const gpoLinks    = Array.isArray(json.gpo?.links) ? json.gpo.links : [];
        const linkedGpoIds = new Set(gpoLinks.map(l => l.source));

        (json.gpo?.nodes || []).forEach(g => {
            if (!g.label) return;

            const isLinked  = linkedGpoIds.has(g.id);
            const isDefault = (g.label || "").toLowerCase().includes("default domain policy");

            // Exclure Default Domain Policy si non liée à une OU
            if (isDefault && !isLinked) return;

            // Badge orpheline si GPO non liée
            const badge = isLinked ? "Politique de sécurité" : "Politique de sécurité ⚠";

            // Trouver l'OU parente via les liens
            const parentLink = gpoLinks.find(l => l.source === g.id);
            const parentOU   = parentLink
                ? (json.structure?.nodes || []).find(n => n.id === parentLink.target)
                : null;
            const position = parentOU ? parentOU.label : (isLinked ? "" : "Non liée à une structure");

            addDoc(g.label, position ? `${g.label} — ${position}` : g.label, badge, "Infrastructure", g, {
                type: "gpo", id: g.id, orphan: !isLinked
            });
        });

        // --- Serveurs de partage ---
        // Un seul résultat par serveur — la vue Ressources est la destination principale.
        // Depuis la vue Infrastructure, le serveur est accessible via l'arborescence.
        (json.infrastructure?.servers || []).forEach(s => {
            if (!s.label) return;
            addDoc(s.label, s.label, "Serveur de partage", "Ressources", s, { type: "server", id: s.id });
        });

        // --- Partages ---
        (json.infrastructure?.servers || []).forEach(s => {
            (s.shares || []).forEach(sh => {
                if (!sh.label) return;
                addDoc(sh.label, `${sh.label} — ${s.label}`, "Partage", "Ressources", sh, {
                    type: "share", id: sh.id, serverId: s.id, serverLabel: s.label
                });
            });
        });

        miniSearch.addAll(searchDocs);

        // =========================================================
        // BARRE DE RECHERCHE
        // =========================================================
        const suggestions = document.getElementById("search-suggestions");

        // Style du dropdown de suggestions
        if (suggestions) {
            suggestions.style.cssText = `
                position:absolute; z-index:200; width:100%;
                background:#fff; border:1px solid #e0e4f0; border-radius:6px;
                box-shadow:0 4px 16px rgba(0,0,0,0.10); display:none;
                max-height:240px; overflow-y:auto;
            `;
        }

        // Référence à l'utilisateur sélectionné dans le dropdown
        // (évite de relancer une recherche à la soumission si déjà choisi)
        let selectedUser = null;

        // --- Suggestions en cours de saisie ---
        input.addEventListener("input", () => {
            const q = input.value.trim();
            document.getElementById("search-empty-msg").style.display = "none";

            // Les premiers résultats n'apparaissent pas s'il n'y a pas au moins 2 caractères
            if (q.length < 2) {
                suggestions.style.display = "none";
                suggestions.innerHTML = "";
                return;
            }

            // On compare la recherche demandée avec les résultats
            const matches = miniSearch.search(q).slice(0, 10);

            if (matches.length === 0) {
                suggestions.innerHTML = '<div style="padding:10px 14px; color:#999; font-size:13px;">Aucun résultat trouvé</div>';
                suggestions.style.display = "block";
                return;
            }

            // Affichage des résultats de recherche
            suggestions.innerHTML = "";
            matches.forEach(m => {
                const item = document.createElement("div");
                item.style.cssText = "padding:8px 14px; cursor:pointer; border-bottom:1px solid #f0f0f0; display:flex; flex-direction:column; gap:2px;";

                // Ligne principale : nom + badge
                const topRow = document.createElement("div");
                topRow.style.cssText = "display:flex; align-items:center; gap:8px;";

                const nameSpan = document.createElement("span");
                nameSpan.style.cssText = "font-size:14px; color:#1f2937; font-weight:500;";
                nameSpan.textContent = m.fullName;

                // Chaque badge identifie le type d'objet dans la recherche
                const badgeColors = {
                    "Identité":             "background:#DCFCE7; color:#15803D;",
                    "Groupe métier":        "background:#E0E7FF; color:#3730A3;",
                    "Administrateur":           "background:#FEF3C7; color:#92400E;",
                    "Groupe Administrateur":    "background:#FEE2E2; color:#B91C1C;",
                    "Service":              "background:#FEF3C7; color:#92400E;",
                    "Groupe technique":     "background:#F3F4F6; color:#374151;",
                    "Structure":            "background:#EDE9FE; color:#6D28D9;",
                    "Politique de sécurité":    "background:#FFF7ED; color:#C2410C;",
                    "Politique de sécurité ⚠":  "background:#FEF2F2; color:#991B1B;",
                    "Serveur de partage":   "background:#ECFDF5; color:#065F46;",
                    "Partage":              "background:#F0FDF4; color:#166534;"
                };

                const badge = document.createElement("span");
                badge.style.cssText = `font-size:10px; font-weight:700; padding:1px 7px; border-radius:10px; white-space:nowrap; ${badgeColors[escapeHtml(m.badge)] || "background:#F3F4F6; color:#374151;"}`;
                badge.textContent = escapeHtml(m.badge);

                topRow.appendChild(nameSpan);
                topRow.appendChild(badge);

                // Ligne secondaire : position pour Structures et GPO, vue pour les autres
                const viewHint = document.createElement("span");
                viewHint.style.cssText = "font-size:11px; color:#9ca3af;";

                const showPath = (escapeHtml(m.badge) === "Structure")
                    && m.samAccount && m.samAccount !== m.fullName;
                if (showPath) {
                    // samAccount contient "Label — Chemin › Arborescence"
                    const pathPart = m.samAccount.includes(" — ")
                        ? m.samAccount.split(" — ").slice(1).join(" — ")
                        : m.samAccount;
                    viewHint.textContent = `Vue ${m.targetView} : ${pathPart}`;
                } else {
                    viewHint.textContent = `Vue ${m.targetView}`;
                }

                item.appendChild(topRow);
                item.appendChild(viewHint);

                // Evénements de listeners :
                // - Un résultat passé sur souris est mise en évidence
                // - Un click redirige vers la vue correspondante avec les informations qu'il faut
                item.addEventListener("mouseenter", () => item.style.background = "#f5f7fa");
                item.addEventListener("mouseleave", () => item.style.background = "#fff");
                item.addEventListener("click", () => {
                    suggestions.style.display = "none";
                    input.value = m.fullName;
                    navigateTo(navMap.get(m.id));
                });

                suggestions.appendChild(item);
            });

            suggestions.style.display = "block";
        });

        // On s'assure, avec cette fonction, qu'on navigue bien vers la bonne vue
        function navigateTo(entry) {
            if (!entry) return;
            const { view, obj, action } = entry;

            // viewKey : valeur que les vues de destination attendent dans target.view
            const viewKeyMap = {
                "user":           "teams",
                "group":          "teams",
                "techGroup":      "tech-access",
                "serviceAccount": "tech-access",
                "ou":             "infrastructure",
                "gpo":            "infrastructure",
                "server":         "resources",
                "share":          "resources"
            };

            const target = {
                id:    action.id,
                label: obj.label,
                view:  viewKeyMap[action.type] || action.type,
                type:  action.type   // conserver le type précis pour les vues qui en ont besoin
            };

            // Ajouter des infos supplémentaires selon le type
            if (action.type === "serviceAccount" || action.type === "user") {
                // Trouver le groupe parent pour teams.html
                const parentGroup = (json.business?.groups || []).find(g =>
                    (g.meta?.members || []).includes(action.id)
                );
                if (parentGroup) target.parentGroupId = parentGroup.id;
            }
            if (action.type === "techGroup") {
                target.isCrit  = action.isCrit;
                target.isPriv  = action.isPriv;
            }
            if (action.type === "share") {
                target.serverId     = action.serverId;
                target.serverLabel  = action.serverLabel;
            }
            if (action.type === "gpo") {
                target.orphan = action.orphan || false;
            }

            sessionStorage.setItem("graphad-search-target", JSON.stringify(target));

            // Naviguer vers la bonne vue
            const viewMap = {
                "user":           "views/teams.html",
                "group":          "views/teams.html",
                "techGroup":      "views/tech-access.html",
                "serviceAccount": "views/tech-access.html",
                "ou":             "views/infrastructure.html",
                "gpo":            "views/infrastructure.html",
                "server":         "views/resources.html",
                "share":          "views/resources.html"
            };

            const dest = viewMap[action.type];
            if (dest) window.location.href = dest;
        }

        // --- Soumission (Entrée ou clic flèche) ---
        function handleSearch() {
            const q        = input.value.trim();
            const emptyMsg = document.getElementById("search-empty-msg");

            if (!q) { emptyMsg.style.display = "block"; return; }
            emptyMsg.style.display    = "none";
            suggestions.style.display = "none";

            const matches = miniSearch.search(q).slice(0, 8);
            if (matches.length === 0) {
                const card = document.getElementById("search-result-card");
                card.style.display = "block";
                card.innerHTML = `<div style="padding:20px; color:#6b7280; font-size:14px; text-align:center;">
                    Aucun résultat pour « ${escapeHtml(q)} ».</div>`;
                return;
            }

            if (matches.length === 1) {
                navigateTo(navMap.get(matches[0].id));
                return;
            }

            // Plusieurs résultats → liste de choix
            showMultipleResults(matches);
        }

        document.getElementById("search-btn").addEventListener("click", handleSearch);
        input.addEventListener("keydown", e => { if (e.key === "Enter") handleSearch(); });

        // Fermer le dropdown si clic en dehors de la zone de recherche
        document.addEventListener("click", e => {
            if (!document.getElementById("search-zone").contains(e.target)) {
                suggestions.style.display = "none";
            }
        });

        // --- Plusieurs résultats : liste de choix cliquables ---
        function showMultipleResults(matches) {
            const card = document.getElementById("search-result-card");
            card.style.cssText = "display:block; background:#fff; border-radius:10px; padding:16px; box-shadow:0 2px 12px rgba(0,0,0,0.08);";
            card.innerHTML = "";

            // Titre en cas de résultats multiples
            const title = document.createElement("div");
            title.style.cssText = "font-size:14px; color:#374151; margin-bottom:12px; font-weight:600;";
            title.textContent = "Plusieurs résultats correspondent — choisissez :";
            card.appendChild(title);

            // Affichage des résultats
            matches.forEach(m => {
                // Récupération des données supplémentaires
                const nav = navMap.get(m.id);
                const el  = document.createElement("div");
                el.style.cssText = "padding:8px 12px; cursor:pointer; border-radius:6px; margin-bottom:4px; background:#F9FAFB; border:1px solid #E5E7EB; display:flex; align-items:center; justify-content:space-between;";

                // Nom complet en gras
                const left = document.createElement("span");
                left.style.cssText = "font-size:13px; color:#1f2937; font-weight:500;";
                left.textContent = m.fullName;

                // Metadonnées formatées (protection XSS imposée)
                const right = document.createElement("span");
                right.style.cssText = "font-size:11px; color:#9ca3af;";
                right.textContent = `${escapeHtml(m.badge)} · ${m.targetView}`;

                // Evénements interactifs
                el.appendChild(left);
                el.appendChild(right);
                // Changement de couleur au survol de la souris
                el.addEventListener("mouseenter", () => el.style.background = "#EFF6FF");
                el.addEventListener("mouseleave", () => el.style.background = "#F9FAFB");
                // Au clic, on s'assure qu'on est redirigé vers la bonne vue avec les informations qui vont avec la recherche
                el.addEventListener("click", () => {
                    input.value = m.fullName;
                    navigateTo(nav);
                });
                card.appendChild(el);
            });
        }
    })
    .catch(err => {
        console.error(err);
        if (grid) grid.innerHTML = '<p style="color:#e53935; padding:20px;">Impossible de charger les données. Veuillez recharger la page ou regénérer un nouveau JSON.</p>';
    });
});