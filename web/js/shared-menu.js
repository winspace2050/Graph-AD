// ====================================================================================
 // shared-menu.js — Menu burger partagé (Graph'AD)
 //
 // - Injecte le bouton ☰, le menu flottant et les modales Documentation / À propos.
 // - Permet aussi le verrouillage de la session pour sécuriser au maximum le JSON.
 // - À importer dans toutes les pages, dans le <head> ou le <body>.
 // ====================================================================================
(function () {

    function init() {

        const isView    = window.location.pathname.includes("/views/");
        const homePath = isView ? "../home.html" : "home.html";

        // -------------------------------------------------------
        // 1) CSS
        // -------------------------------------------------------
        const style = document.createElement("style");
        style.textContent = `
            #btn-burger {
                position: fixed; top: 14px; right: 20px; z-index: 9999;
                background: #fff; border: 1px solid #e0e4f0; border-radius: 8px;
                padding: 7px 12px; font-size: 18px; cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08); color: #374151;
            }
            #burger-menu {
                display: none; position: fixed; top: 52px; right: 20px; z-index: 9998;
                background: #fff; border: 1px solid #e0e4f0; border-radius: 10px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12); min-width: 200px; overflow: hidden;
            }
            .burger-item {
                display: block; width: 100%; text-align: left;
                padding: 10px 16px; font-size: 13px; font-weight: 500;
                background: transparent; border: none; cursor: pointer; color: #374151;
            }
            .burger-item:hover { background: #f9fafb; }
            .burger-separator { border-top: 1px solid #f0f0f0; margin: 4px 0; }
            .graphad-modal-overlay {
                display: none; position: fixed; inset: 0; z-index: 10000;
                background:rgba(0,0,0,0.55); backdrop-filter:blur(2px);
                align-items: center; justify-content: center;
            }
            .graphad-modal-box {
                background: #fff; border-radius: 12px; width: 90%; max-width: 480px;
                max-height: 85vh; overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0,0,0,0.2);
            }
            .graphad-modal-header {
                display: flex; align-items: center; justify-content: space-between;
                background:linear-gradient(135deg,#4A90D9,#8B5CF6);
                padding: 16px 20px; border-bottom: 1px solid #f0f0f0;
            }
            .graphad-modal-close {
                background: none; border: none; font-size: 20px;
                cursor: pointer; color: #e9eff8;
            }
            #doc-modal strong { color: #4A90D9; }
            #doc-modal h3 { font-size: 15px; font-weight: 700; color: #4A90D9; margin: 20px 0 8px; }
        `;
        document.head.appendChild(style);

        // -------------------------------------------------------
        // 2) Bouton burger + menu flottant
        // -------------------------------------------------------
        document.body.insertAdjacentHTML("afterbegin", `
            <button id="btn-burger">☰</button>
            <div id="burger-menu">
                <button class="burger-item" id="burger-doc">Documentation</button>
                <button class="burger-item" id="burger-about">À propos</button>
                <div class="burger-separator"></div>
                <button class="burger-item" id="burger-lock" style="color:#EF4444;">Verrouiller</button>
            </div>
        `);

        // -------------------------------------------------------
        // 3) Modale Documentation
        // -------------------------------------------------------
        document.body.insertAdjacentHTML("beforeend", `
            <div id="doc-modal" style="display:none; position:fixed; inset:0; z-index:10000;
                 align-items:center; justify-content:center;
                 background:rgba(0,0,0,0.55); backdrop-filter:blur(2px);"
                 onclick="if(event.target===this)this.style.display='none'">

                <div style="background:#fff; border-radius:14px; width:90vw; max-width:960px;
                            height:82vh; display:flex; overflow:hidden;
                            box-shadow:0 8px 40px rgba(0,0,0,0.22);">

                    <nav style="width:220px; flex-shrink:0; background:#f8faff;
                                border-right:1px solid #e5e7eb; padding:24px 0; overflow-y:auto;">
                        <div style="padding:0 20px 16px; font-size:12px; font-weight:700;
                                     text-transform:uppercase; color:#9ca3af; letter-spacing:.05em;">
                            Documentation Graph'AD
                        </div>
                        <div id="doc-nav"></div>
                    </nav>

                    <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                        <div style="display:flex; align-items:center; justify-content:space-between;
                                    padding:18px 28px; border-bottom:1px solid #e5e7eb; flex-shrink:0;
                                    background:linear-gradient(135deg,#4A90D9,#8B5CF6);">
                            <span style="font-size:17px; font-weight:700; color:#e9eff8;"
                                  id="doc-section-title">Documentation</span>
                            <button onclick="document.getElementById('doc-modal').style.display='none'"
                                style="background:none; border:none; font-size:20px; color:#e9eff8;
                                       cursor:pointer; line-height:1; padding:4px 8px;">✕</button>
                        </div>
                        <div id="doc-content"
                             style="flex:1; overflow-y:auto; padding:28px 32px; font-size:14px;
                                    line-height:1.7; color:#374151;"></div>
                    </div>
                </div>
            </div>
        `);

        // Contenu de la documentation qui peut être modifié ci-besoin
        // Pour ajouter une nouvelle section (obligatoirement entre accolades {}), vous devez définir son
        // identifiant (id), son titre (label) ainsi que le contenu html entre ` ` comme bon il vous semble
        // Veiller à ce que chaque section, exceptée la dernière, soit séparée d'une virgule.
        const sections = [
            {
                id: "presentation",
                label: "Présentation",
                html: `
                    <p style="font-size:14px;line-height:1.8;">
                        Graph'AD vous permet de visualiser et de comprendre simplement les accès et la
                        structure de votre annuaire Active Directory — sans aucune connaissance technique requise.
                    </p>
                    <p style="font-size:14px;line-height:1.8;margin-top:12px;">
                        Dans une entreprise, l'Active Directory centralise tout : les comptes des employés,
                        leurs droits d'accès aux dossiers partagés, les règles de sécurité appliquées aux
                        postes, et l'organisation interne de l'annuaire. Ce système est puissant, mais
                        illisible pour quelqu'un qui n'est pas informaticien.
                    </p>
                    <p style="font-size:14px;line-height:1.8;margin-top:12px;">
                        <strong>Graph'AD traduit cette complexité en informations claires et actionnables.</strong>
                        Qui appartient à quel groupe ? Qui a accès à quels dossiers ? Quels comptes sont
                        inactifs ou présentent un risque ? Autant de questions auxquelles Graph'AD répond
                        en quelques clics.
                    </p>
                    <p style="font-size:14px;line-height:1.8;margin-top:12px;">
                        <strong>Un point clé : la recherche depuis le tableau de bord.</strong> En cherchant
                        un collaborateur, un groupe ou un dossier partagé, vous obtenez immédiatement sa
                        fiche complète : sa position dans la structure, ses groupes d'appartenance et ses
                        accès aux ressources réseau.
                    </p>
                    <div style="background:#EFF6FF;border-left:3px solid #4A90D9;border-radius:6px;
                                padding:12px 16px;margin-top:20px;font-size:13px;color:#1e3a5f;">
                        Graph'AD est un outil de <strong>consultation uniquement</strong>. Il ne modifie
                        jamais l'Active Directory. Aucune donnée n'est envoyée sur internet — tout reste
                        sur votre infrastructure.
                    </div>
                    <p style="font-size:13px;color:#6b7280;margin-top:20px;">
                        Graph'AD s'adresse aussi bien aux administrateurs système qu'aux responsables
                        non-techniques : DRH, managers, DAF, RSSI.
                    </p>
                `
            },
            {
                id: "demarrage",
                label: "Démarrage",
                html: `
                    <div style="background:#FFF8E1;border:1px solid #FFD54F;border-radius:8px;
                                padding:12px 16px;margin-bottom:20px;font-size:13px;color:#5D4037;">
                        ⚠ Le démarrage de Graph'AD nécessite des <strong>droits administrateur</strong>
                        sur le contrôleur de domaine. Faites un clic droit sur
                        <code style="background:#FFF3E0;padding:1px 5px;border-radius:4px;">graphad.exe</code>
                        et choisissez <strong>« Exécuter en tant qu'administrateur »</strong>.
                    </div>
                    <ol style="padding-left:20px;line-height:2.2;font-size:14px;">
                        <li>Cliquez droit sur <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">graphad.exe</code>
                            et choisissez <strong>Exécuter en tant qu'administrateur</strong>.</li>
                        <li>Une fenêtre de commande s'ouvre. Graph'AD vérifie les prérequis automatiquement.</li>
                        <li>Dans la section "Nouvelle collecte", choisissez une <strong>phrase de passe</strong> (12 caractères minimum)
                            que vous saisissez 2 fois. Cliquez ensuite sur "Lancer la collecte".</li>
                        <li>Patientez pendant la collecte Active Directory (quelques secondes à quelques minutes
                            selon la taille de votre annuaire).</li>
                        <li>Une fois l'archive généré, cliquez sur fermer dans la fenêtre de chargement.</li>
                        <li>Cliquez sur le bouton "ouvrir" correspondant à l'archive généré puis saisissez la phrase de passe définie
                            précédemment et appuyez sur Entrée. Vous pouvez alors naviguer sur la collecte.</li>
                        <li>Pour fermer proprement : ouvrez le menu en haut à droite et cliquez sur <strong>Verrouiller</strong>".
                            cliquez enfin sur "Quitter Graph'AD" ou sur la croix en haut à droite pour fermer.</li>
                    </ol>
                    <p style="margin-top:16px;font-size:13px;color:#6b7280;">
                        Vous pouvez, à tout moment, démarrer la collecte que vous avez effectué ou réaliser
                        plusieurs collectes que vous retrouverez sous forme de liste. Chaque archive peut
                        être supprimée à tout moment, mais cette action est irréversible. Attention à ne pas
                        déplacer graphad.exe hors du dossier GraphAD car il ne détecte les collectes au dossier
                        où vous l'avez effectué.
                    </p>
                `
            },
            {
                id: "prise-en-main",
                label: "Prise en main",
                html: `
                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:0 0 8px;">La barre de recherche</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Depuis le tableau de bord, la barre de recherche vous permet de trouver directement
                        n'importe quel élément de l'annuaire : un collaborateur, un groupe, une structure,
                        une politique de sécurité, un serveur ou un dossier partagé. Tapez au moins deux
                        lettres — les suggestions apparaissent automatiquement. Cliquer sur un résultat
                        ouvre la vue correspondante et positionne l'interface sur l'élément trouvé.
                    </p>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Les quatre tuiles du tableau de bord</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Chaque tuile donne accès à une vue thématique. Cliquez sur l'une d'elles pour
                        l'explorer. Un bouton <strong>« ← Retour au tableau de bord »</strong> en haut
                        à gauche de chaque vue vous permet de revenir à tout moment.
                    </p>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Structure des vues</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Chaque vue est organisée en deux zones principales : une colonne de gauche
                        (introduction à la vue, guide d'utilisation et légende des couleurs) et une
                        zone centrale (le contenu interactif). Un <strong>panneau latéral</strong>
                        s'ouvre automatiquement à droite lorsque vous cliquez sur un élément, et
                        affiche toutes ses informations détaillées.
                    </p>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Les indicateurs de couleur</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Un petit rond coloré accompagne chaque élément dans les listes :
                    </p>
                    <ul style="font-size:14px;line-height:2;padding-left:20px;">
                        <li><strong style="color:#008000;">Vert</strong> — situation normale</li>
                        <li><strong style="color:#FFA500;">Orange</strong> — situation à vérifier</li>
                        <li><strong style="color:#FF0000;">Rouge</strong> — anomalie détectée, à signaler à l'administrateur</li>
                    </ul>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Le menu ☰</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Le bouton ☰ en haut à droite est disponible dans toutes les vues. Il donne accès
                        à cette Documentation, à la section <em>À propos</em>, et permet de
                        <strong>verrouiller votre session</strong> pour sécuriser l'accès aux données.
                    </p>
                `
            },
            {
                id: "vues",
                label: "Les 4 vues",
                html: `
                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:0 0 8px;">Équipes &amp; Collaborateurs</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Liste tous les collaborateurs organisés par groupes métiers. Cliquez sur un groupe
                        pour voir ses membres, puis sur un membre pour afficher sa fiche complète dans la
                        colonne de droite (statut, dernière connexion, groupes d'appartenance).
                    </p>
                    <p style="font-size:14px;line-height:1.8;margin-top:8px;">
                        Cette vue détecte et signale : les comptes désactivés encore présents dans un groupe
                        (badge rouge), les comptes jamais utilisés ou à surveiller (badge orange), les collaborateurs sans groupe (encadré orange),
                        et les groupes vides. Un bouton <strong>« Voir la position dans la vue Infrastructure »</strong>
                        est disponible pour chaque groupe sélectionné.
                    </p>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Accès techniques</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Liste les groupes techniques de l'annuaire (groupes qui donnent des droits d'accès
                        informatiques élevés) et les comptes de service. Les groupes sont triés par niveau
                        de criticité : les groupes d'administrateurs du domaine apparaissent en premier (badge rouge),
                        suivis des groupes à privilèges (badge orange), puis des groupes standards (badge vert).
                    </p>
                    <p style="font-size:14px;line-height:1.8;margin-top:8px;">
                        Les comptes de service sont identifiés par un badge <strong>« Service »</strong> violet.
                    </p>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Infrastructure</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Représentation hiérarchique de l'annuaire — structures internes (OU), politiques de
                        sécurité (GPO), serveurs et dossiers partagés. Cliquez sur un bloc pour le déplier
                        et explorer son contenu. Un panneau latéral s'ouvre avec les détails de l'élément
                        sélectionné.
                    </p>
                    <ul style="font-size:14px;line-height:2;padding-left:20px;margin-top:8px;">
                        <li>Les structures vides sont affichées en gris et signalées dans le panneau latéral.</li>
                        <li>Les politiques de sécurité non liées à une structure sont regroupées dans
                            <em>« Politiques de sécurité non liées »</em> en bas de l'arbre.</li>
                        <li>Une barre de recherche locale permet de trouver et mettre en surbrillance
                            n'importe quel élément sans déplier manuellement l'arborescence.</li>
                    </ul>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Ressources</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Liste tous les dossiers partagés sur le réseau, organisés par serveur. Cliquez sur
                        un serveur pour voir ses partages, puis sur un partage pour afficher les permissions
                        par groupe dans le panneau latéral.
                    </p>
                    <p style="font-size:14px;line-height:1.8;margin-top:8px;">
                        Les anomalies sont signalées par des badges colorés :
                        Badge rouge : aucune permission définie (accès inconnu) ;
                        Badge orange : accès ouvert à tous les utilisateurs ou contrôle total accordé à un groupe
                        non-administrateur.
                    </p>
                `
            },
            {
                id: "avance",
                label: "Avancé",
                html: `
                    <div style="background:#FFF8E1;border:1px solid #FFD54F;border-radius:8px;
                                padding:12px 16px;margin-bottom:20px;font-size:13px;color:#5D4037;">
                        ⚠ Cette section s'adresse aux administrateurs informatiques. Les manipulations
                        ci-dessous peuvent avoir des conséquences sur vos données. Procédez avec précaution.
                    </div>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:0 0 8px;">Gestion des données et des archives</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Les données se trouvent dans le dossier <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">data/</code>.
                        Ces fichiers sont chiffrés — ne jamais les modifier directement, leur contenu serait irrémédiablement corrompu.
                    </p>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Phrase de passe oubliée</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        Il n'existe aucune procédure de récupération. Si la phrase de passe est perdue,
                        les données chiffrées sont définitivement inaccessibles. La seule solution est de
                        relancer une collecte complète avec une nouvelle phrase de passe.
                    </p>

                    <h3 style="font-size:15px;font-weight:700;color:#4A90D9;margin:20px 0 8px;">Signaler un problème</h3>
                    <p style="font-size:14px;line-height:1.8;">
                        En cas d'anomalie, fournissez : Les journaux de collecte dans le dossier
                            <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">logs/</code>
                            (fichiers <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px;">graphad.AAAA-MM-JJ.log</code>
			    ouvrables via le bloc-note)</li>
                    </ul>
                `
            },
            {
                id: "arborescence",
                label: "Arborescence",
                html: `
                    <div style="background:#FFF8E1;border:1px solid #FFD54F;border-radius:8px;
                                padding:12px 16px;margin-bottom:20px;font-size:13px;color:#5D4037;">
                        ⚠ Cette section s'adresse aux développeurs. Le détail du fonctionnement de chaque
                        fichier est disponible dans la documentation technique du projet.
                    </div>
                    <pre style="background:#f3f4f6;font-size:12px;padding:16px;border-radius:8px;overflow-x:auto;line-height:1.8;">
        GraphAD/
        ├─ docs/                        # Documentation du projet
        ├─ logs/                        # Journaux de collecte (auto-générés)
        ├─ data/
        ├─ target/                      # Artefacts de compilation Rust (auto-générés)
        ├─ src-tauri/
        │  │  src
        │  │  ├─ collector.rs              # Collecte LDAP + construction du JSON
        │  │  ├─ crypto.rs                 # Chiffrement AES-256-CBC + HMAC-SHA-256
        │  │  └─ main.rs                   # Point d'entrée : orchestration générale
        │  ├─ build.rs                     # Point d'entrée de compilation tauri
        │  ├─ Cargo.toml                   # Manifeste Rust (dépendances, version)
        │  ├─ Cargo.lock                   # Versions résolues (ne pas modifier)
        │  └─ tauri.conf.json              # Schéma tauri de l'application
        ├─ web/
        │  ├─ css/style.css             # Feuille de style globale
        │  ├─ js/
        │  │  ├─ crypto.js              # Déchiffrement AES-256 + gestion de session
        │  │  ├─ dashboard-loader.js    # Tableau de bord + recherche MiniSearch
        │  │  ├─ minisearch.min.js      # Moteur de recherche (bibliothèque externe)
        │  │  ├─ shared-menu.js         # Menu burger + modales (partagé toutes vues)
        │  │  └─ utils.js               # Fonctions utilitaires partagées
        │  ├─ ux/
        │  │  ├─ ActionList.js
        │  │  ├─ DiagnosticCard.js
        │  │  ├─ InfrastructureTree.js
        │  │  ├─ IntroCard.js
        │  │  ├─ Legend.js
        │  │  ├─ OnboardingBanner.js
        │  │  ├─ PedagogyCard.js
        │  │  ├─ ResourceView.js
        │  │  ├─ SidePanel.js
        │  │  ├─ TeamsView.js
        │  │  └─ TechAccessView.js
        │  ├─ views/
        │  │  ├─ infrastructure.html
        │  │  ├─ resources.html
        │  │  ├─ teams.html
        │  │  └─ tech-access.html
        │  ├─ index.html                # Tableau de bord
        │  └─ home.html                 # Page d'accueil
                    </pre>
                `
            }
        ];

        const nav     = document.getElementById("doc-nav");
        const content = document.getElementById("doc-content");
        const title   = document.getElementById("doc-section-title");

        /* Sélection de chaque section disponible */
        function showSection(s) {
            content.innerHTML = s.html;
            title.textContent = s.label;
            nav.querySelectorAll(".doc-nav-item").forEach(el => {
                el.style.background = el.dataset.id === s.id ? "#EFF6FF" : "transparent";
                el.style.color      = el.dataset.id === s.id ? "#1D4ED8" : "#374151";
                el.style.fontWeight = el.dataset.id === s.id ? "600"     : "400";
            });
        }

        sections.forEach((s, i) => {
            const item = document.createElement("div");
            item.className   = "doc-nav-item";
            item.dataset.id  = s.id;
            item.textContent = s.label;
            item.style.cssText = "padding:9px 20px; cursor:pointer; font-size:13px; border-radius:0; transition:background 0.15s; color:#374151;";
            item.addEventListener("mouseenter", () => { if (item.style.fontWeight !== "600") item.style.background = "#f5f7fa"; });
            item.addEventListener("mouseleave", () => { if (item.style.fontWeight !== "600") item.style.background = "transparent"; });
            item.addEventListener("click", () => showSection(s));
            nav.appendChild(item);
            if (i === 0) showSection(s);
        });

        // -------------------------------------------------------
        // 4) Modale À propos
        // -------------------------------------------------------

        document.body.insertAdjacentHTML("beforeend", `
            <div id="about-modal" class="graphad-modal-overlay">
                <div class="graphad-modal-box">
                    <div class="graphad-modal-header">
                        <span style="font-size:16px; font-weight:700; color:#e9eff8;">À propos de Graph'AD</span>
                        <button class="graphad-modal-close" id="about-close">✕</button>
                    </div>
                    <div style="padding:20px; font-size:13px; color:#374151; line-height:1.6;">

                        <!-- Titre et version -->
                        <div style="text-align:center; margin-bottom:20px;">
                            <div style="font-size:22px; font-weight:800; color:#4A90D9;">Graph'AD</div>
                            <div style="font-size:12px; color:#9ca3af; margin-top:4px;">v.1.0.2</div>
                            <div style="font-size:12px; color:#6b7280; margin-top:2px;">Outil de gouvernance des accès Active Directory</div>
                        </div>

                        <!-- Crédits -->
                        <div style="background:#f9fafb; border-radius:8px; padding:12px 16px; margin-bottom:16px;">
                            <div style="font-size:10px; text-transform:uppercase; color:#9ca3af; font-weight:600; margin-bottom:8px;">Crédits</div>
                            <div>Développement du logiciel par <strong>winspace2050</strong></div>
                            <div style="margin-top:12px; padding-top:12px; border-top:1px solid #e5e7eb;">
                                <div style="font-size:10px; text-transform:uppercase; color:#9ca3af; font-weight:600; margin-bottom:8px;">Technologies</div>
                                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                                    <span style="background:#FEF3E2; color:#92400E; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">Rust</span>
                                    <span style="background:#FEF3E2; color:#92400E; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">Tauri</span>
                                    <span style="background:#EFF6FF; color:#1e40af; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">LDAP / Kerberos</span>
                                    <span style="background:#EFF6FF; color:#1e40af; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">PBKDF2 · AES-256-CBC · HMAC-SHA-256</span>
                                    <span style="background:#F0FDF4; color:#14532d; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">Web Crypto API</span>
                                    <span style="background:#F0FDF4; color:#14532d; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">HTML / CSS / JS</span>
                                    <span style="background:#FAF5FF; color:#581c87; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">MiniSearch</span>
                                    <span style="background:#FAF5FF; color:#581c87; font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px;">PowerShell / SMB</span>
                                </div>
                            </div>
                        </div>

                        <!-- Confidentialité -->
                        <div style="background:#f9fafb; border-radius:8px; padding:12px 16px; margin-bottom:16px;">
                            <div style="font-size:10px; text-transform:uppercase; color:#9ca3af; font-weight:600; margin-bottom:8px;">Confidentialité</div>
                            <div>Graph'AD fonctionne <strong>entièrement en local</strong>. Aucune donnée n'est transmise à des serveurs externes. Les données collectées sont chiffrées (<strong>AES-256-CBC + HMAC-SHA-256</strong>) et stockées uniquement sur votre machine. Le déchiffrement s'effectue dans votre navigateur — la phrase de passe ne quitte jamais votre poste.</div>
                        </div>

                        <!-- RGPD -->
                        <div style="background:#FEF3C7; border-left:3px solid #F59E0B; border-radius:6px; padding:10px 14px; margin-bottom:16px; font-size:12px; color:#92400E;">
                            L'utilisation de cet outil implique le traitement de données à caractère personnel.
                            Veillez à vous conformer au <strong>RGPD (UE 2016/679)</strong> et à la
                            <strong>loi n°78-17 du 6 janvier 1978</strong>.
                        </div>

                        <!-- Licence -->
                        <div style="background:#f9fafb; border-radius:8px; padding:12px 16px; margin-bottom:16px;">
                            <div style="font-size:10px; text-transform:uppercase; color:#9ca3af; font-weight:600; margin-bottom:8px;">Licence</div>
                            <div>©2026 winspace2050 - Tout droits réservés</div>
                            <div>Le présent logiciel est délivrée sous licence open-source MIT.</div>
                        </div>

                        <!-- Contact -->
                        <div style="text-align:center; font-size:12px; color:#9ca3af;">
                            Pour toute information, n'hésitez pas à ouvrir un fil de discution avec winspace2050 sur github.
                        </div>

                    </div>
                </div>
            </div>
        `);

        // -------------------------------------------------------
        // 5) Logique du menu
        // -------------------------------------------------------
        const burgerBtn  = document.getElementById("btn-burger");
        const burgerMenu = document.getElementById("burger-menu");

        burgerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            burgerMenu.style.display = burgerMenu.style.display === "none" ? "block" : "none";
        });

        document.addEventListener("click", () => {
            burgerMenu.style.display = "none";
        });

        document.getElementById("burger-lock").addEventListener("click", () => {
            if (typeof GraphADCrypto !== "undefined") GraphADCrypto.clear();
            GraphADCrypto.clear();
            sessionStorage.removeItem("_gad_active_file");
            window.location.replace(homePath);
        });

        document.getElementById("burger-doc").addEventListener("click", () => {
            burgerMenu.style.display = "none";
            document.getElementById("doc-modal").style.display = "flex";
        });

        document.getElementById("burger-about").addEventListener("click", () => {
            burgerMenu.style.display = "none";
            document.getElementById("about-modal").style.display = "flex";
        });

        document.getElementById("about-close").addEventListener("click", () => {
            document.getElementById("about-modal").style.display = "none";
        });

    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();