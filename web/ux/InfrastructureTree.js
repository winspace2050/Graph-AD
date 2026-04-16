// ============================================================================
// InfrastrucutureTree.js - layout central de la vue Infrastructure
//
// La vue se présente en une arborescence dépliable en blocs compacts.
// Elle permet de visualiser la hiérachie du domaine Active Directory.
// ============================================================================


// ---------------------------------------------------------------------------
// 1) UTILITAIRES
// ---------------------------------------------------------------------------

// Détermine si un DN est enfant direct d’un autre
function isDirectChildDN(objectDN, parentDN) {
    if (!objectDN || !parentDN) return false;
    return objectDN.replace(/^[^,]+,/, "") === parentDN;
}

// Un nœud est une feuille s'il n'a aucun enfant de type structurel (OU, serveur, DC, GPO)
function isLeafNode(node) {
    if (!node.children || node.children.length === 0) return true;
    return !node.children.some(c => ["ou", "server", "dc", "gpo", "dc-container"].includes(c.type));
}

// Un nœud est trop chargé pour être détaillé inline — renvoie l'affichage au panneau latéral
function isTooLarge(node, threshold = 20) {
    if (!node.original) return false;
    const meta = node.original.meta || {};
    const count =
        (meta.groupsCount || 0) +
        (meta.usersCount || 0) +
        (meta.machinesCount || 0) +
        (meta.gpoCount || 0);
    return count > threshold;
}

// ---------------------------------------------------------------------------
// 2) VALIDATION DOMAIN CONTROLLERS
// ---------------------------------------------------------------------------
function validateDomainControllers(dcOU, allIdentities, allGroups, gpoLinks, gpoNodes) {

    // Etape 1 : On vérifie si l'OU Domain controllers existe
    // Sinon, c'est une anomalie
    if (!dcOU) {
        return {
            machines: [],
            users: [],
            groups: [],
            gpos: [],
            anomalies: ["L’OU Domain Controllers est absente du domaine."]
        };
    }

    // Etape 2 : On filtre des objets dans l'OU
    const dn = dcOU.meta?.dn;

    // Post-initialisation de la constante dn, on décide de garder trois objets dans la vue Infrastructure :
    // - Les machines du domaine (serveurs, ordinateurs)
    // - Les utilisateurs du domaine
    // - Les groupes du domaine
    const machines = allIdentities.filter(i => i.meta?.isMachine && isDirectChildDN(i.meta?.dn, dn));
    const users    = allIdentities.filter(i => !i.meta?.isMachine && isDirectChildDN(i.meta?.dn, dn));
    const groups   = allGroups.filter(g => isDirectChildDN(g.meta?.dn, dn));

    // Etape 3 : On récupère les GPO liées à des OU
    const gpos = gpoLinks
        .filter(l => l.target === dcOU.id)
        .map(l => gpoNodes.find(n => n.id === l.source));

    // Etape 4 : On détecte des anomalies
    const anomalies = [];

    if (users.length > 0) anomalies.push("Des utilisateurs sont présents dans Domain Controllers.");     // Utilisateurs dans l'OU => Risque de sécurité
    if (groups.length > 0) anomalies.push("Des groupes sont présents dans Domain Controllers.");        // Groupes dans l'OU => Risque de sécurité
    if (machines.length > 2) anomalies.push("Plus de deux contrôleurs de domaine détectés.");           // Plus de 2 contrôleurs de domaine => selon le contexte, c'est un problème de conception
    // La constante ci-dessous est un GUID qui identifie Defailt Domain Controllers Policy
    const DEFAULT_DC_GPO_GUID = "6ac1786c-016f-11d2-945f-00c04fb984f9";

    // En fait, elle va nous permettre de vérifier si la politique par défaut des controlleurs de domaine existe
    const defaultDCGPO = gpos.find(g =>
        g?.meta?.guid?.toUpperCase() === DEFAULT_DC_GPO_GUID.toUpperCase()
    );

    if (!defaultDCGPO) {
        anomalies.push("La GPO par défaut des contrôleurs de domaine est absente ou remplacée.");
    }
    return { machines, users, groups, gpos, anomalies };
}



// ---------------------------------------------------------------------------
// 3) CONSTRUCTION DE L’ARBRE NORMALISÉ
// Construit l'arbre normalisé à partir du JSON brut.
// Entrée  : json (données AD déchiffrées)
// Sortie  : objet arbre avec type "domain" à la racine, contenant dcContainer,
//           les OUs de premier niveau et le conteneur des partages.
// ---------------------------------------------------------------------------

function buildInfrastructureTree(json) {

    // Chaque constante permet l'extraction sécurisée de tableaux de valeurs des propriétés imbriquées de l'objet JSON.
    // Une propriété manque ? Ou la constante ne reçoit pas de tableau ? Dans ce cas, le tableau retourné est vide.
    const infraServers = Array.isArray(json.infrastructure?.servers) ? json.infrastructure.servers : [];
    const nodes        = Array.isArray(json.structure?.nodes)        ? json.structure.nodes        : [];
    const links        = Array.isArray(json.structure?.links)        ? json.structure.links        : [];
    const gpoNodes     = Array.isArray(json.gpo?.nodes)              ? json.gpo.nodes              : [];
    const gpoLinks     = Array.isArray(json.gpo?.links)              ? json.gpo.links              : [];
    // Exception : Tous les identifiants source issus du tableau gpoLinks sont extraits à partir des liens GPO
    const linkedGpoIds = new Set(gpoLinks.map(l => l.source));

    // Les groupes métiers et techniques sont fusionnés dans un seul et même noeud
    const allGroups = [
        ...(json.business?.groups || []),
        ...(json.technical?.groups || [])
    ];

    // On fait pareil pour les comptes identités et techniques
    // Le tip -> déduoblonner par id pour éviter de voir un doublon
    const seenIds = new Set();
    const allIdentities = [
        ...(json.business?.identities || []),
        ...(json.technical?.accounts  || [])
    ].filter(i => {
        if (!i.id || seenIds.has(i.id)) return false;
        seenIds.add(i.id);
        return true;
    });

    const rootOU = nodes.find(n => n.meta?.isRoot);

    // renvoie l’ID du parent d’un nœud
    function getParentId(nodeId) {
        const link = links.find(l => l.source === nodeId);
        return link ? link.target : null;
    }
    
    // Domain Controllers est traité séparément (dcContainer) — ne pas l'inclure ici
    const topLevelOUs = nodes.filter(n => {
        if (n.label === "Domain Controllers") return false;
        if (n === rootOU) return false;
        
        const parentId = getParentId(n.id);
        
        // 1) Si on a une racine : top-level = enfants directs de la racine
        if (rootOU) return parentId === rootOU.id;
        
        // 2) Sinon : top-level = ceux sans parent
        return parentId === null;
    });
    const topLevelOUNodes = topLevelOUs.map(ou => buildOUNode(ou));

    const rootDomain = rootOU || json.structure?.domains?.[0] || {
        label: "Domaine",
        type: "domain"
    };

    // Trouver l’OU Domain Controllers
    const dcOU = nodes.find(n => n.label === "Domain Controllers");

    // On appelle ici la validation du controlleur de domaine racine
    const dcValidation = validateDomainControllers(dcOU, allIdentities, allGroups, gpoLinks, gpoNodes);


    // Récupère les enfants OU
    function getChildOUs(parentId) {
        return links
            .filter(l => l.target === parentId)
            .map(l => nodes.find(n => n.id === l.source))
            .filter(Boolean);
    }

    // Récupère les GPO appliquées
    function getLinkedGPOs(ouId) {
        return gpoLinks
            .filter(l => l.target === ouId)
            .map(l => gpoNodes.find(n => n.id === l.source))
            .filter(Boolean);
    }


    // Construit récursivement un nœud OU avec ses enfants (sous-OUs, GPOs).
    // Les utilisateurs, groupes et machines rattachés à l'OU sont stockés dans .original
    // pour affichage dans le panneau latéral — ils ne deviennent pas des nœuds de l'arbre.
    function buildOUNode(ouNode, parentPath = "") {
        const currentPath = parentPath ? `${parentPath} › ${ouNode.label}` : ouNode.label; // C'est le chemin d'accès complet de l'OU à partir du chemin d'accès (Exemple : Contoso > Support > Users)

        const ouDN = ouNode.meta?.dn || ""; // On récupère le nom distinctif de l'OU

        // Le bloc de quatre constantes permet un filtrage et une extraction des objets enfant
        // Elle influt sur le comportement de l'arborescence lorsqu'on clique sur un objet en particulier
        const groupsHere = allGroups.filter(g => isDirectChildDN(g.meta?.dn, ouDN));
        const usersHere = allIdentities.filter(i => !i.meta?.isMachine && isDirectChildDN(i.meta?.dn, ouDN));
        const machinesHere = allIdentities.filter(i => i.meta?.isMachine && isDirectChildDN(i.meta?.dn, ouDN));
        const gposHere = getLinkedGPOs(ouNode.id);

        // On traite ici les OU enfants de façon récursive
        const childrenOUs = getChildOUs(ouNode.id);
        const ouChildren = childrenOUs.map(child => buildOUNode(child, currentPath));

        // Chaque GPO sont converti en noeud d'arborescence
        // Note : Une GPO est orpheline si elle n'est liée à aucune OU
        const gpoChildren = gposHere.map(g => ({
            label: g.label,
            type: "gpo",
            id: g.id,
            orphan: !linkedGpoIds.has(g.id),
            original: {
                ...g,
                applied: true,
                linkedFrom: currentPath,
            },
            children: []
        }));

        // Dans le cas où une OU ne contient ni les groupes, ni les utilisateurs, ni les machines, ni les gpos, ni les ou enfants
        // On considère alors que l'OU est vide et on indique cette propriété dans l'arbre JSON final
        const isEmpty =
            groupsHere.length === 0 &&
            usersHere.length === 0 &&
            machinesHere.length === 0 &&
            gposHere.length === 0 &&
            ouChildren.length === 0;

        // Retour de l'ojbet final à paritr des éléments définis ci-dessus
        // Elle permet l'affichage, sous une forme hiérarchique, des objets dans la vue Infrastructure
        return {
            label: ouNode.label,
            type: "ou",
            id: ouNode.id,
            empty: isEmpty,
            original: {
                ...ouNode,
                groups: groupsHere,
                users: usersHere,
                machines: machinesHere,
                gpos: gposHere,
                empty: isEmpty
            },
            children: [...gpoChildren, ...ouChildren]
        };
    }



    // -----------------------------------------------------------------------
    // CONTENEUR DOMAIN CONTROLLERS
    // 
    // La constante permet une représentation personnalisée de la structure
    // "Default Domain Controllers Policy"
    // A noter que la constante n'est créé que si l'OU en question existe
    // Sinon, le retour est "null"
    // -----------------------------------------------------------------------

    const dcContainer = dcOU ? {
        // Structure principal de ce qu'on va afficher dans le panneau d'information
        // A noter que le conteneur sera une OU spéciale comparé aux autres d'où un id différent
        label: "Serveurs contrôleurs du domaine",
        type: "dc-container",
        id: "dc-container",
        original: {
            label: "Serveurs contrôleurs du domaine",
            technicalName: "Domain Controllers",
            description:
                "Les serveurs contrôleurs du domaine sont les serveurs essentiels de votre annuaire Active Directory. " +
                "Ils vérifient les identités, appliquent les règles de sécurité et synchronisent les informations entre eux.",
            gpos: getLinkedGPOs(dcOU.id),
            servers: getChildOUs(dcOU.id),
            validation: dcValidation
        },
        // On génère deux types d'enfants
        children: [
            // Les serveurs contrôleurs de domaine
            ...getChildOUs(dcOU.id).map(dc => ({
                label: dc.label,
                type: "dc",
                id: dc.id,
                original: dc,
                children: []
            })),
            // Les GPO liés (bien que "Default Domain Controllers Policy" doit être le seul présent)
            ...getLinkedGPOs(dcOU.id).map(g => ({
                label: g.label,
                type: "gpo",
                id: g.id,
                original: {
                    ...g,
                    applied: true,
                    linkedFrom: "Serveurs contrôleurs du domaine"
                },
                children: []
            }))
        ]
    } : null;


    // ----------------------------------------------------------------------------------------
    // CONTENEUR PARTAGES
    // Les partages sont construits comme enfants directs du serveur (dépliables dans l'arbre)
    // Le panneau latéral reste utilisé pour le détail d'un partage individuel au clic
    // ----------------------------------------------------------------------------------------

    const sharesContainer = {
        label: "Partages",
        type: "shares-root",
        id: "shares-root",
        original: { description: "Liste des partages réseau." },
        children: infraServers.map(s => ({
            label: s.label,
            type: "server",
            id: s.id,
            original: s,
            children: (Array.isArray(s.shares) ? s.shares : []).map(sh => ({
                label: sh.label,
                type: "share",
                id: sh.id,
                original: { ...sh, server: s.label },
                children: []
            }))
        }))
    };

    // GPO orphelines — non liées à aucune OU
    const orphanGpos = gpoNodes.filter(g =>
        !linkedGpoIds.has(g.id) &&
        !(g.label || "").toLowerCase().includes("default domain policy")
    );
    // Tous les GPO orphelines sont référencés dans un conteneur spécial dédié
    const orphanGpoContainer = orphanGpos.length > 0 ? {
        label: "Politiques de sécurité non liées",
        type: "ou",
        id: "orphan-gpos",
        original: {
            label: "Politiques de sécurité non liées",
            description: "Ces politiques de sécurité existent dans l'annuaire mais ne sont liées à aucune structure. Elles n'ont aucun effet sur le domaine."
        },
        children: orphanGpos.map(g => ({
            label: g.label,
            type: "gpo",
            id: g.id,
            orphan: true,
            original: {
                ...g,
                orphan: true,
                applied: false,
                linkedFrom: null
            },
            children: []
        }))
    } : null;

    // -----------------------------------------------------------------------
    // CONSTRUCTION DE L’ARBRE FINAL
    // -----------------------------------------------------------------------
    const tree = {
        label: rootDomain.label,
        type: "domain",
        original: rootDomain,
        children: []
    };

    if (dcContainer) tree.children.push(dcContainer);
    tree.children.push(...topLevelOUNodes);
    if (orphanGpoContainer) tree.children.push(orphanGpoContainer);
    tree.children.push(sharesContainer);

    return tree;
}



// ---------------------------------------------------------------------------
// 4) RENDERER ARBORESCENT
// ---------------------------------------------------------------------------

function renderInfrastructureTree(container, treeData) {
    container.innerHTML = "";
    container.style.cssText = "overflow: auto; padding: 20px;";

    // Crée l'élément DOM d'un bloc dans l'arborescence.
    // La mention sous le nom (nombre d'utilisateurs, partages, permissions) est calculée
    // selon le type du nœud. Les alertes de risques sont intentionnellement absentes ici
    // — elles sont traitées dans la vue Ressources.
    function createNodeEl(node) {
        // Pour chaque id de container, on attribut au bloc en question une couleur cohérente avec la légende
        const color = (node.type === "ou" && node.empty)
            ? "#9CA3AF"
            : ({
                "domain":       "#8B5CF6",
                "ou":           "#4A90D9",
                "dc-container": "#4A90D9",
                "dc":           "#4A90D9",
                "server":       "#10B981",
                "gpo":          "#F97316",
                "shares-root":  "#10B981",
                "share":        "#007a00"
            }[node.type] || "#4A90D9");

        // Bloc principal
        const block = document.createElement("div");
        block.setAttribute("data-node-id", node.id);
        block.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #fff;
            border: 2px solid ${color};
            border-radius: 8px;
            padding: 6px 12px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            color: #1f2937;
            white-space: nowrap;
            transition: box-shadow 0.15s;
            position: relative;
        `;
        // Listener de survol de la souris
        block.addEventListener("mouseenter", () => block.style.boxShadow = `0 0 0 3px ${color}44`);
        block.addEventListener("mouseleave", () => block.style.boxShadow = "");

        // Mention de contenu
        let mention = "";
        // Noeud OU : on affiche la liste des utilisateurs, des groupes et des ordinateurs s'ils sont directement liés à l'OU.
        if (node.type === "ou" && node.original) {
            const orig = node.original;
            const counts = [];
            if ((orig.users   || []).length) counts.push(`${orig.users.length} utilisateur(s)`);
            if ((orig.groups  || []).length) counts.push(`${orig.groups.length} groupe(s)`);
            if ((orig.machines|| []).length) counts.push(`${orig.machines.length} ordinateur(s)`);
            if (counts.length) mention = counts.join(", ");
        }

        // Noeud serveur : ce sont les serveurs de partage du domaine.
        if (node.type === "server" && node.original) {
            const n = (node.original.shares || []).length;
            if (n) mention = `${n} partage(s)`;
        }

        // Noeud partage : ce sont les partages disponibles du domaine pour chaque serveur.
        // Les permissions sont consultables dans la vue Ressources.
        if (node.type === "share" && node.original) {
            const perms = (node.original.permissions || []).length;
            mention = perms > 0 ? `${perms} permission(s)` : "Aucune permission";
        }

        // Le résultat est renvoyé dans le panneau d'information (avec protection XSS).
        block.innerHTML = `
            <span>${escapeHtml(node.label)}</span>
            ${mention ? `<span style="font-size:11px;color:#6b7280;font-weight:400;">— ${mention}</span>` : ""}
        `;

        // Evénement clic : ouverture du panneau d'information
        block.addEventListener("click", (e) => {
            e.stopPropagation();
            openInfrastructurePanel(node);
        });

        return block;
    }

    // Construit récursivement le DOM de l'arborescence dépliable.
    // Les nœuds avec enfants ont un toggle ▶/▼. Un seul listener click gère à la fois
    // l'ouverture du panneau latéral et le dépliage.
    function buildLevel(node, startCollapsed = true) {
        const col = document.createElement("div");
        col.style.cssText = "display:flex; flex-direction:column; align-items:center;";

        // Création des noeuds et de ses enfants
        const nodeEl = createNodeEl(node);
        const children = node.children || [];

        if (children.length > 0) {
            // Indicateur collapse
            const arrow = document.createElement("span");
            arrow.textContent = startCollapsed ? "▶" : "▼";
            arrow.style.cssText = "font-size:10px; color:#9ca3af; margin-left:6px; cursor:pointer;";
            nodeEl.appendChild(arrow);

            // Wrapper enfants (caché par défaut)
            const childrenWrapper = document.createElement("div");
            childrenWrapper.style.cssText = "display:flex; flex-direction:column; align-items:center;";
            childrenWrapper.style.display = startCollapsed ? "none" : "flex";
            childrenWrapper.className = "infra-children-wrapper";

            // Ligne verticale
            const vLine = document.createElement("div");
            vLine.style.cssText = "width:2px; height:20px; background:#e5e7eb;";
            childrenWrapper.appendChild(vLine);

            // Rangée d'enfants
            const childRow = document.createElement("div");
            childRow.className = "child-row";
            childRow.style.cssText = "display:flex; flex-direction:row; align-items:flex-start; gap:24px; flex-wrap:nowrap; position:relative; padding-top:20px;";

            // C'est ici qu'intervient l'organisation dynamique des éléments DOM.
            // On crée alors une véritable hiérarchie.
            children.forEach(child => {
                const childCol = document.createElement("div");
                childCol.style.cssText = "display:flex; flex-direction:column; align-items:center;";
                const tick = document.createElement("div");
                tick.style.cssText = "width:2px; height:20px; background:#e5e7eb;";
                childCol.appendChild(tick);
                childCol.appendChild(buildLevel(child, true));
                childRow.appendChild(childCol);
            });

            childrenWrapper.appendChild(childRow);

            // Toggle clic
            nodeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                openInfrastructurePanel(node);
                const collapsed = childrenWrapper.style.display === "none";
                childrenWrapper.style.display = collapsed ? "flex" : "none";
                arrow.textContent = collapsed ? "▼" : "▶";
            });

            col.appendChild(nodeEl);
            col.appendChild(childrenWrapper);
        } else {
            // Le noeud n'est pas enfant : seul le panneau d'information intervient.
            nodeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                openInfrastructurePanel(node);
            });
            col.appendChild(nodeEl);
        }

        return col;
    }

    container.appendChild(buildLevel(treeData, false));
}


// ---------------------------------------------------------------------------
// 5) PANNEAU LATÉRAL
//
// Les informations du panneau s'affichent en fonction de l'objet sélectionné
// ---------------------------------------------------------------------------

function openInfrastructurePanel(node) {

    // Serveur de partage
    if (node.type === "server") {
        SidePanel.open({
            label: node.label,
            type: "server",
            id: node.id,
            shares: node.original?.shares || []
        });
        return;
    }

    // Partage
    if (node.type === "share") {
        SidePanel.open({
            id: node.original.id || node.id || null,
            label: node.original.label,
            type: "share",
            path: node.original.path,
            permissions: (node.original.permissions || []).map(p => ({
                group: p.group,
                access: translateAccess(p.access)
            })),
            server: node.original.server || null
        });
        return;
    }

    // Domain Controllers
    if (node.type === "dc-container") {
        SidePanel.open({
            label: "Serveurs contrôleurs du domaine",
            type: "dc-container",
            anomalies: node.original.validation.anomalies,
            servers: node.original.validation.machines,
            gpos: node.original.validation.gpos
        });
        return;
    }

    // Conteneur GPO non liées
    if (node.id === "orphan-gpos") {
        SidePanel.open({
            id:    "orphan-gpos",
            label: node.label,
            type:  "ou"
        });
        return;
    }
    
    // Conteneur Partages
    if (node.type === "shares-root") {
        SidePanel.open({
            id:    "shares-root",
            label: node.label,
            type:  "shares-root"
        });
        return;
    }

    // Autres nœuds (dont GPO)
    if (node.original) {
        SidePanel.open({
            ...node.original,
            // Propager les flags du nœud d'arbre qui ne sont pas dans original
            orphan: node.orphan || false,
            linkedFrom: node.original.linkedFrom || node.linkedFrom || null
        });
    } else {
        // Fallback - rien n'est affiché dans le panneau d'information si l'objet n'est pas connu
        SidePanel.open({
            label: node.label,
            type:  node.type,
            id:    node.id || null,
            orphan: node.orphan || false
        });
    }
}