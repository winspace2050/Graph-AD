// =============================================================================
// collector.rs - Collecte des données Active Directory et construction du JSON
//
//   - Récupère les données demandés d'un Active Directory.
//   - Construit les noeuds et liens à partir de ces dernières.
//   - Récupère et construit les partages SMB disponibles d'un domaine.
//   - Construit ensuite le JSON chiffré.
//   - Le JSON créé sera archivé dans /data et horodaté.
//   - La collecte est loggé et horodaté dans le dossier log .
// =============================================================================

// Appel des dépendances
use tauri::Emitter;
use ldap3::{LdapConnAsync, Scope, SearchEntry};
use serde_json::{json, Value};
use std::path::Path;
use std::collections::HashMap;
use chrono::Local;
use tracing::{info, warn};

// Valeurs de bits pour manipuler l'attribut userAccountControl dans AD
const UAC_DISABLED:          u64 = 0x0002;  // Indique que le compte utilisateur est désactivé (valeur décimale : 2).
const UAC_PWD_NEVER_EXPIRES: u64 = 0x10000; // Indique que le mot de passe n'expire jamais (valeur décimale : 65536)

/// Événement émis vers le frontend à chaque étape de la collecte.
#[derive(serde::Serialize, Clone)]
pub struct ProgressEvent {
    pub step:    u8,
    pub total:   u8,
    pub message: String,
}

/// Émet un événement de progression vers la fenêtre Tauri ET écrit dans le log fichier.
fn emit_progress(app: &tauri::AppHandle, step: u8, total: u8, message: &str) {
    info!("[{}/{}] {}", step, total, message);
    let _ = app.emit("collect-progress", ProgressEvent {
        step,
        total,
        message: message.to_string(),
    });
}

// ---------------------------------------------------------------------------
// Point d'entrée public
// ---------------------------------------------------------------------------

pub async fn collect_with_events(
    app:        tauri::AppHandle,
    data_dir:   &Path,
    passphrase: &str,
) -> Result<(), String> {

    // Récupérer les données AD pour la cartographie
    let json_value = collect_ldap(&app).await?;

    // Les trois méthodes suivantes concerne le chiffrement et la sauvegarde
    // La première méthode sérialise les données en JSON
    let json_str = serde_json::to_string(&json_value)
        .map_err(|e| format!("Erreur sérialisation JSON : {}", e))?;

    // La seconde méthode chiffre le JSON avec une clé dérivée de la phrase de passe
    // Le fichier crypto.rs est, par ailleurs, en charge du chiffrement et de la
    // génération du code HMAC
    let enc_bytes = crate::crypto::encrypt(json_str.as_bytes(), passphrase);

    // La troisième méthode permet l'archivage horodaté des JSON
    std::fs::create_dir_all(&data_dir).ok();
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    let archive   = data_dir.join(format!("graphAD_{}.json.enc", timestamp));
    std::fs::write(&archive, &enc_bytes)
        .map_err(|e| format!("Impossible d'écrire l'archive : {}", e))?;

    purge_old_archives(&data_dir); // Nettoyage des anciennes archives

    // Information de l'archive écrite
    info!("Archive écrite : {}", archive.display());
    Ok(())
}


// ---------------------------------------------------------------------------
// Collecte LDAP asynchrone
// ---------------------------------------------------------------------------

async fn collect_ldap(app: &tauri::AppHandle) -> Result<Value, String> {
    // On tente de se connecter sur l'Active Directory
    let dc = std::env::var("LOGONSERVER")
        .map(|s| s.trim_start_matches('\\').to_string())
        .unwrap_or_else(|_| "localhost".to_string());

    // On se connecte via LDAP (port 389)
    info!("Connexion LDAP à {}", dc);

    let (conn, mut ldap) = LdapConnAsync::new(&format!("ldap://{}:389", dc))
        .await
        .map_err(|e| format!("Connexion LDAP échouée : {}", e))?;

    tokio::spawn(ldap3::drive!(conn));  // Les requêtes entrantes/sortantes sont traités sans bloquer le thread principal (on garanti que la connexion LDAP reste active pendant la collecte AD)

    // Sur la connexion LDAP, on démarre une authentification Kerberos en utilisant les informations d'identification Kerberos par défaut
    ldap.sasl_gssapi_bind(&dc)
        .await
        .map_err(|e| format!("Authentification Kerberos échouée : {}", e))?
        .success()
        .map_err(|e| format!("Kerberos refusé : {}", e))?;

    // Après connexion, le nom de domaine est récupéré et loggé
    let base_dn = get_base_dn(&mut ldap).await?;
    info!("Domaine : {}", base_dn);

    // Collecte journalisée des données
    // Les six étapes ci-dessous sont effectués par des méthodes qui appellent
    // les fonctions définies dans ce fichier.
    // Ces méthodes concernent la partie collecte LDAP
    // Les étapes sont, par ailleurs, affichées côté frontend.
    emit_progress(&app, 1, 8, "Récupération des utilisateurs...");
    let users = get_users(&mut ldap, &base_dn).await?;

    emit_progress(&app, 2, 8, "Récupération des machines...");
    let computers = get_computers(&mut ldap, &base_dn).await?;

    emit_progress(&app, 3, 8, "Récupération des groupes...");
    let groups = get_groups(&mut ldap, &base_dn).await?;

    emit_progress(&app, 4, 8, "Récupération des OUs...");
    let ous = get_ous(&mut ldap, &base_dn).await?;

    emit_progress(&app, 5, 8, "Récupération des GPOs...");
    let gpo_nodes = get_gpo_nodes(&mut ldap, &base_dn).await?;

    emit_progress(&app, 6, 8, "Calcul des liaisons GPO...");
    let gpo_links = build_gpo_links(&ous, &gpo_nodes);

    ldap.unbind().await.ok();   // On se déconnecte de LDAP après finalisation de la collecte AD

    // -------------------------------------------------------------------------
    // Index
    // Permet de créer des correspondances utiles pour la construction des liens
    // et la recherche sur le dashboard ou les vues
    // -------------------------------------------------------------------------

    // Correspondance nom distinctif (DN) de l'utilisateur -> nom SAM du compte
    // Exemple :
    //
    // {
    //  "CN=John Doe,OU=Users,DC=corp": "jdoe",
    //  "CN=Jane Smith,OU=Admins,DC=corp": "jsmith"
    // } 
    let user_by_dn: HashMap<String, String> = users.iter()
        .filter_map(|u| Some((u["dn"].as_str()?.to_string(), u["sam"].as_str()?.to_string())))
        .collect();

    // Correspondance DN du groupe -> nom SAM du groupe
    // Exemple :
    //
    // {
    //  "CN=Admins,OU=Groups,DC=corp": "admin-group",
    //  "CN=Developers,DC=corp": "devs"
    // } 
    let group_by_dn: HashMap<String, String> = groups.iter()
        .filter_map(|g| Some((g["dn"].as_str()?.to_string(), g["sam"].as_str()?.to_string())))
        .collect();

    // Correspondance DN des utilisateurs -> Groupes d'appartenance
    // Note : cela permet également des recherches à double sens : utilisateur -> groupes ET groupe -> utilisateurs
    // Exemple :
    // {
    //  "CN=John Doe,OU=Users,DC=corp": ["Admins", "Developers"],
    //  "CN=Jane Smith,OU=Admins,DC=corp": ["Admins"]
    // }
    let mut user_to_groups: HashMap<String, Vec<String>> = HashMap::new();
    for g in &groups {
        if let Some(members) = g["members"].as_array() {
            for m in members {
                if let Some(m_dn) = m.as_str() {
                    user_to_groups
                        .entry(m_dn.to_string())
                        .or_default()
                        .push(g["name"].as_str().unwrap_or("").to_string());
                }
            }
        }
    }

    // Chaque unité organisationnelle (OU) aura un identifiant stable et unique généré à partir de son DN
    // On évite alors les conflits
    // L'identifiant est en base64 et le nom de l'OU est décodé côté web
    // Exemple :
    // {
    //   "OU=Sales,DC=corp": "ou-U0FMRTMtREM9Y29ycA==",
    //   "OU=Engineering,DC=corp": "ou-RU5HSU5FRVJJTkcsREM9Y29ycA=="
    //  }
    let ou_id_map: HashMap<String, String> = ous.iter()
        .filter_map(|ou| {
            let dn = ou["dn"].as_str()?.to_string();
            Some((dn.clone(), format!("ou-{}", base64_encode(&dn))))
        })
        .collect();

    // -------------------------------------------------------------------------
    // Identités
    // -------------------------------------------------------------------------
    let mut identities: Vec<Value> = Vec::new();    // Ici, on initialise la liste des utilisateurs que l'on stockera sous le format JSON

    // On parcourt chaque utilisateur de la collection users et on extrait les champs clés :
    // - Nom distinctif
    // - Nom SAM du compte
    // - Indicateur de contrôle (par défaut, on met 0).
    // Pour ce dernier point, les deux constantes d'initialisation en haut du code interviennent ici :
    // -> Un compte activé possède comme valeur 0.
    // -> Un compte ayant un mot de passe expirant possède comme valeur 0.
    for u in &users {
        let dn        = u["dn"].as_str().unwrap_or("");
        let sam       = u["sam"].as_str().unwrap_or("");
        let uac       = u["uac"].as_u64().unwrap_or(0);
        let enabled   = (uac & UAC_DISABLED) == 0;
        let pwd_never = (uac & UAC_PWD_NEVER_EXPIRES) != 0;

        // Lien Groupes - Utilisateurs
        let groups_of_user: Vec<String> = user_to_groups.get(dn).cloned().unwrap_or_default();

        // Définition des groupes à privilèges
        let privileged_groups = [
            "Domain Admins", "Admins du domaine",
            "Enterprise Admins", "Administrateurs de l'entreprise",
            "Schema Admins", "Administrateurs du schéma",
            "Administrators", "Administrateurs",
            "Group Policy Creator Owners",
        ];

        // Détection des comptes de services
        let sam_lower = sam.to_lowercase();
        let is_service =
            ["Administrator", "Guest", "krbtgt", "Administrateur", "Invité"].contains(&sam)
            || sam_lower.starts_with("krbtgt_")
            || sam_lower.starts_with("svc_")
            || sam_lower.starts_with("service_")
            || sam_lower.starts_with("sa_")
            || sam_lower.starts_with("sql_")
            || sam_lower.starts_with("backup_")
            || groups_of_user.iter().any(|g| privileged_groups.contains(&g.as_str()));

        // Détection des comptes à privilèges
        // Ils sont marqués comme compte de service
        let is_privileged = is_service
            && !["Administrator","Administrateur","Guest","Invité","krbtgt"].contains(&sam)
            && !sam_lower.starts_with("krbtgt_");

        // On détermine le statut du compte
        let status = if !enabled { "disabled" }
            else if groups_of_user.contains(&"Guests".to_string())
                 || groups_of_user.contains(&"Domain Guests".to_string()) { "invited" }
            else if u["lastLogon"].is_null() { "inactive" }
            else { "active" };

        // Chaque utilisateur aura la construction JSON suivante :
        identities.push(json!({
            "id": format!("user-{}", sam), "label": sam,
            "meta": {
                "dn": dn, "groups": groups_of_user,
                "isServiceAccount": is_service, "isPrivileged": is_privileged,
                "access": [], "status": status,
                "lastLogon": u["lastLogon"], "passwordLastSet": u["pwdLastSet"],
                "passwordNeverExpires": pwd_never, "enabled": enabled,
                "isMachine": false, "description": u["description"],
                "servicePrincipalName": u["spn"]
            }
        }));
    }

    // On parcourt aussi les ordinateurs du domaine
    // Ils vont servir pour la vue Infrastructure
    // On extrait les champs clés suivants :
    // - Nom distinctif
    // - Nom SAM du compte
    // - Indicateur de contrôle (une seule constante d'initialisation intervient : un ordinateur activé possède comme valeur 0)
    for c in &computers {
        let dn      = c["dn"].as_str().unwrap_or("");
        let sam     = c["sam"].as_str().unwrap_or("");
        let uac     = c["uac"].as_u64().unwrap_or(0);
        let enabled = (uac & UAC_DISABLED) == 0;
        let status  = if !enabled { "disabled" }
                      else if c["lastLogon"].is_null() { "inactive" }
                      else { "active" };

        // Chaque ordinateur aura la construction JSON suivante :
        identities.push(json!({
            "id": format!("machine-{}", sam), "label": sam,
            "meta": { "dn": dn, "status": status, "lastLogon": c["lastLogon"],
                      "enabled": enabled, "isMachine": true, "groups": [],
                      "description": c["description"] }
        }));
    }

    // -------------------------------------------------------------------------
    // Groupes métiers
    // -------------------------------------------------------------------------
    // Définition des groupes métiers par leur préfixe
    let business_prefixes = ["GG_", "G_Metier_", "BG_", "Equipe_", "Service_", "Departement_"];	// Peut être modifié selon la définition des groupes métiers dans l'entreprise
    let mut business_groups: Vec<Value> = Vec::new();       // Ici, on initialise la liste des groupes métiers que l'on stockera sous le format JSON

    // On parcourt chaque groupe de la collection groups et on extrait le nom du groupe
    for g in &groups {
        let name = g["name"].as_str().unwrap_or("");
        if !business_prefixes.iter().any(|p| name.starts_with(p)) { continue; }     // Le groupe est ignoré s'il ne correspond pas au préfix définissant le groupe métier

        let mut members:    Vec<String> = Vec::new();   // Liste des membres
        let mut sub_groups: Vec<String> = Vec::new();   // Liste des groupes imbriqués

        // A partir des deux listes, on classifie
        // Le DN des des utilisateurs et des groupes seront convertis en un ID d'utilisateur ou de sous-groupe
        // Si le préfixe de l'ID est "user-", on l'ajoute dans la table "members"
        // Si le préfixe de l'ID est "bg-", on l'ajoute dans la table "sub_groups"
        if let Some(raw) = g["members"].as_array() {
            for m in raw {
                let m_dn = m.as_str().unwrap_or("");
                if let Some(s) = user_by_dn.get(m_dn)      { members.push(format!("user-{}", s)); }
                else if let Some(s) = group_by_dn.get(m_dn) { sub_groups.push(format!("bg-{}", s)); }
            }
        }

        // Détermination de la cohérence et de la taille du groupe
        // Trois méthodes, trois critères distincts
        let coherence    = if members.is_empty() { "obsolete" } else { "ok" };	// Détection des groupes vides
        let member_count = members.len();
        let all_members: Vec<String> = members.into_iter().chain(sub_groups).collect();

        // La construction JSON se réalise à partir de tous les éléments définies de cette section
        // Chaque groupe métier aura son préfixe bg- dans le JSON
        business_groups.push(json!({
            "id": format!("bg-{}", name), "label": name,
            "meta": { "dn": g["dn"], "members": all_members,
                      "memberCount": member_count, "coherence": coherence }
        }));
    }

    // -------------------------------------------------------------------------
    // Groupes techniques
    // -------------------------------------------------------------------------
    // Liste des groupes par défaut ou intégrés courants dans un Active Directory
    // Ces groupes ne sont pas forcément utiles dans la cartographie d'un AD
    // On va les filtrer par la suite
    let builtin_names = [
        "Domain Admins", "Domain Users", "Domain Guests",
        "Domain Computers", "Domain Controllers",
        "Enterprise Admins", "Schema Admins",
        "Administrators", "Users", "Guests",
        "Group Policy Creator Owners",
        "Dns Admins", "IIS_IUSRS",
        "Remote Desktop Users", "Remote Management Users",
        "Pre-Windows 2000 Compatible Access",
    ];
    let mut technical_groups: Vec<Value> = Vec::new();  // On prépare la liste des groupes techniques

    // On parcourt chaque groupes de la collection groups et on extrait le nom du groupe
    for g in &groups {
        let name = g["name"].as_str().unwrap_or("");
        if business_prefixes.iter().any(|p| name.starts_with(p)) { continue; }  // Il est supposé ici que les groupes n'ayant pas de préfixe définies dans business_prefixes sont définies comme groupes techniques
        if builtin_names.contains(&name) { continue; }                          // On en profite également pour filtrer les groupes par défaut ou intégrés courants

        // On extrait le nom distinctif des membres du groupe et on les associe à l'aide de la table de correspondance user_by_dn
        // Chaque utilisateur commence par user- selon le formatage défini dans la méthode
        let members: Vec<String> = g["members"].as_array()
            .map(|arr| arr.iter()
                .filter_map(|m| user_by_dn.get(m.as_str()?).map(|s| format!("user-{}", s)))
                .collect())
            .unwrap_or_default();

        if members.is_empty() { continue; } // Un groupe est ignoré si aucun membre n'est trouvé

        let sam = g["sam"].as_str().unwrap_or(name);    // On extrait le nom SAM du groupe technique
        // La construction JSON se réalise à partir de tous les éléments définies de cette section
        // Chaque groupe technique aura son préfixe tg- dans le JSON
        technical_groups.push(json!({
            "id": format!("tg-{}", sam), "label": sam,
            "meta": { "dn": g["dn"], "members": members, "description": g["description"] }
        }));
    }

    // Dans la liste des utilisateurs du domaine, les identités marqués comme
    // comptes de service seront stockés dans la liste "service_accounts"
    let service_accounts: Vec<Value> = identities.iter()
        .filter(|i| i["meta"]["isServiceAccount"].as_bool().unwrap_or(false))
        .cloned()
        .collect();

    // -------------------------------------------------------------------------
    // Structure OU
    // -------------------------------------------------------------------------
    let domain_dn    = base_dn.clone();                             // Copie l'attribut DN du domaine
    let domain_label = dn_to_dns(&domain_dn);                       // Converit le DN en un nom DNS lisible
    let domain_id    = format!("ou-{}", base64_encode(&domain_dn)); // Encode le DN en base64, toujours dans la logique de créer un ID unique et sécurisé

    // La liste structure_nodes des noeuds d'unité organisationelle contient :
    // - L'ID unique en base64
    // - le nom affiché
    // - les métodonnées : DN réel, structure remplie ou vide, est-elle une OU racine ou non
    let mut structure_nodes: Vec<Value> = vec![json!({
        "id": domain_id.clone(), "label": domain_label,
        "meta": { "dn": domain_dn, "empty": false, "isRoot": true }
    })];

    // Ajout des noeuds pour chaque OU : on extrait le DN des OU dans la collection ous, puis on crée un noeuds avec :
    // - L'ID en base64 du DN (un ID préfixé par ou- au passage)
    // - Le nom de l'OU
    // - le DN original
    for ou in &ous {
        let dn = ou["dn"].as_str().unwrap_or("");
        structure_nodes.push(json!({
            "id": format!("ou-{}", base64_encode(dn)),
            "label": ou["name"],
            "meta": { "dn": dn }
        }));
    }

    // La liste structure_links des liens hiérarchiques permet la création d'une arborescence
    // structure_links contient :
    // - Le DN extrait de l'OU
    // - Le parent immédiat (en séparant le DN. Cela permet de créer une vraie hiérarchie). Deux cas de figure :
    //      -> Le parent est domaine racine : attribut domain_id (Exemple : OU Sales. On a "OU=Sales,DC=entreprise,DC=com". Le parent supposé est "DC=entreprise,DC=com", or, il y a seulement 2 DC : le domaine est entreprise.com)
    //      -> Le parent n'est pas domaine racine (il y a plus de 2 DC pour le parent): on cherche l'ID du parent via ou_id_map ou on le génère (au passage, l'ID est préfixé par ou-)
    // Dans structure_links, on ajoute les liens enfant -> parent qui seront visibles dans l'arbre final.
    let mut structure_links: Vec<Value> = Vec::new();
    for ou in &ous {
        let dn        = ou["dn"].as_str().unwrap_or("");
        let parent_dn = dn.splitn(2, ',').nth(1).unwrap_or("").trim();
        let child_id  = ou_id_map.get(dn)
            .cloned().unwrap_or_else(|| format!("ou-{}", base64_encode(dn)));
        let parent_id = if parent_dn == domain_dn { domain_id.clone() }
            else { ou_id_map.get(parent_dn)
                .cloned().unwrap_or_else(|| format!("ou-{}", base64_encode(parent_dn))) };
        structure_links.push(json!({ "source": child_id, "target": parent_id, "meta": {} }));
    }

    // -------------------------------------------------------------------------
    // Fin de la collecte LDAP asynchrone
    // Partages SMB via WinRM
    // La liste ne contient que seulement les partages du domaine
    // -------------------------------------------------------------------------
    emit_progress(app, 7, 8, "Collecte des partages SMB...");
    let mut infra_servers: Vec<Value> = Vec::new();        // On prépare la liste des serveurs du domaine de partage et leurs partages SMB
    // On n'inclut que les ordinateurs dont le nom de l'OS contient server (C'est exactement le cas pour "Windows Server")
    for c in computers.iter().filter(|c| c["os"].as_str()
        .map(|s| s.to_lowercase().contains("server"))
        .unwrap_or(false))
    {
        // Pour chaque serveur de partages :
        // -> extraction du nom SAM du compte "ordinateur" (au passage, le caractère final $ n'est pas affiché)
        // -> collection des partages du serveur via CIM/WinRM (voir la fonction collect_smb_shares plus bas)
        let sam      = c["sam"].as_str().unwrap_or("");
        let hostname = sam.trim_end_matches('$');
        let shares   = collect_smb_shares(hostname).await;
        // Le JSON de cette partie contient :
        // - ID unique (préfixé par server-)
        // - nom d'hôte
        // - métadonnées tels que DN
        // - liste des partages
        infra_servers.push(json!({
            "id":     format!("server-{}", hostname),
            "label":  hostname,
            "meta":   { "dn": c["dn"] },
            "shares": shares
        }));
    }

    // -------------------------------------------------------------------------
    // Construction du JSON final
    // On réunit toutes les listes pour fabriquer un unique JSON
    // Ce dernier sera immédiatement chiffrée lors de la génération
    // -------------------------------------------------------------------------
    emit_progress(&app, 8, 8, "Construction du JSON...");
    Ok(json!({
        "business":       { "groups": business_groups, "identities": identities },
        "technical":      { "groups": technical_groups, "accounts": service_accounts },
        "structure":      { "nodes": structure_nodes, "links": structure_links },
        "gpo":            { "nodes": gpo_nodes, "links": gpo_links },
        "infrastructure": { "servers": infra_servers }
    }))
}

// ---------------------------------------------------------------------------
// Requêtes LDAP
// Ces requêtes sont appelés dans les étapes 1 à 5 du processus de collecte
// Les fonctions de requêtes sont toutes asynchrones
// ---------------------------------------------------------------------------

// Récupération du defaultNamingContext depuis le rootDSE d'un serveur LDAP
// Ca correspond à la base DN (Distinguished Name) par défaut pour les opérations de recherche
// On découvre alors la base DN sans la coder en dur
async fn get_base_dn(ldap: &mut ldap3::Ldap) -> Result<String, String> {
    // Méthode de recherche en ciblant l'entrée racine ou rootDSE ("") sans cibler les sous-arborescences (scope = Scope::Base)
    // On récupère l'entrée avec objectClass=* et on demande spécifiquement l'attribut defaultNamingContext
    let (rs, _) = ldap.search("", Scope::Base, "(objectClass=*)", vec!["defaultNamingContext"])
        .await.map_err(|e| format!("rootDSE : {}", e))?
        .success().map_err(|e| format!("rootDSE refusé : {}", e))?;
    // On extrait la première valeur du defaultNamingContext. Il s'agit alors du DN de base.
    rs.into_iter()
        .filter_map(|e| {
            let e = SearchEntry::construct(e);
            e.attrs.get("defaultNamingContext")?.first().cloned()
        })
        .next()
        .ok_or_else(|| "defaultNamingContext introuvable".to_string())
}

// Récupération d'une liste d'utilisateur dans l'annuaire LDAP
async fn get_users(ldap: &mut ldap3::Ldap, base: &str) -> Result<Vec<Value>, String> {
    // On récupère les attributs pour chaque utilisateur :
    // - Nom SAM du compte
    // - DN pour le chemin complet de l'objet dans l'annuaire
    // - Etat du compte
    // - dernière connexion
    // - dernier changement de mot de passe
    // - description du compte s'il existe
    // - SPN s'il s'agit d'un compte de service    
    let attrs = vec!["sAMAccountName","distinguishedName","userAccountControl",
                     "lastLogon","pwdLastSet","description","servicePrincipalName"];
    // Recherche à partir du DN de base et recherche récursive dans tous les sous-conteneurs
    let (rs, _) = ldap.search(base, Scope::Subtree,
        "(&(objectClass=user)(!(objectClass=computer)))", attrs)
        .await.map_err(|e| format!("Utilisateurs LDAP : {}", e))?
        .success().map_err(|e| format!("Recherche utilisateurs refusée : {}", e))?;
    // Les entrées LDAP utilisateurs seront transformées en objets JSON
    // first_attr(&e, "attr_name") -> récupération de la première valeur de l'attribut
    // On convertit les uac en valeur binaire u64. Elle sert à la détection compte désactivé / mot de passe n'expire jamais
    // filetime_to_iso() -> conversion horodatage au format ISO
    // SPN peut être traité comme une liste (car peut être absent ou multiple)
    Ok(rs.into_iter().map(|e| {
        let e = SearchEntry::construct(e);
        json!({
            "dn":          first_attr(&e, "distinguishedName"),
            "sam":         first_attr(&e, "sAMAccountName"),
            "uac":         first_attr(&e, "userAccountControl").parse::<u64>().unwrap_or(0),
            "lastLogon":   filetime_to_iso(first_attr(&e, "lastLogon").parse::<u64>().unwrap_or(0)),
            "pwdLastSet":  filetime_to_iso(first_attr(&e, "pwdLastSet").parse::<u64>().unwrap_or(0)),
            "description": first_attr(&e, "description"),
            "spn":         e.attrs.get("servicePrincipalName").cloned().unwrap_or_default()
        })
    }).collect())
}

// Récupération d'une liste d'ordinateur
async fn get_computers(ldap: &mut ldap3::Ldap, base: &str) -> Result<Vec<Value>, String> {
    // On récupère les attributs pour chaque utilisateur :
    // - Nom SAM du compte
    // - DN pour le chemin complet de l'objet dans l'annuaire
    // - Etat du compte
    // - dernière connexion
    // - description du compte s'il existe
    // - OS
    let attrs = vec!["sAMAccountName","distinguishedName","userAccountControl",
                     "lastLogon","description","operatingSystem"];
    // Recherche à partir du DN de base et recherche récursive dans tous les sous-conteneurs
    let (rs, _) = ldap.search(base, Scope::Subtree, "(objectClass=computer)", attrs)
        .await.map_err(|e| format!("Machines LDAP : {}", e))?
        .success().map_err(|e| format!("Recherche machines refusée : {}", e))?;
    // Les entrées LDAP ordinateurs seront transformées en objets JSON
    // first_attr(&e, "attr_name") -> récupération de la première valeur de l'attribut
    // On convertit les uac en valeur binaire u64. Elle sert à la détection compte désactivé
    // filetime_to_iso() -> conversion horodatage au format ISO
    Ok(rs.into_iter().map(|e| {
        let e = SearchEntry::construct(e);
        json!({
            "dn":          first_attr(&e, "distinguishedName"),
            "sam":         first_attr(&e, "sAMAccountName"),
            "uac":         first_attr(&e, "userAccountControl").parse::<u64>().unwrap_or(0),
            "lastLogon":   filetime_to_iso(first_attr(&e, "lastLogon").parse::<u64>().unwrap_or(0)),
            "description": first_attr(&e, "description"),
            "os":          first_attr(&e, "operatingSystem")
        })
    }).collect())
}

// Récupération d'une liste de groupes
async fn get_groups(ldap: &mut ldap3::Ldap, base: &str) -> Result<Vec<Value>, String> {
    // On récupère les attributs pour chaque groupe :
    // - Nom SAM du groupe
    // - DN pour le chemin complet de l'objet dans l'annuaire
    // - Nom d'affichage du groupe
    // - Liste des membres
    // - description du groupe s'il existe
    let attrs = vec!["sAMAccountName","distinguishedName","name","member","description"];
    // Recherche à partir du DN de base et recherche récursive dans tous les sous-conteneurs
    let (rs, _) = ldap.search(base, Scope::Subtree, "(objectClass=group)", attrs)
        .await.map_err(|e| format!("Groupes LDAP : {}", e))?
        .success().map_err(|e| format!("Recherche groupes refusée : {}", e))?;
    // Les entrées LDAP ordinateurs seront transformées en objets JSON
    // On construit et convertit les utilisateurs juste avant de construire le json
    // first_attr(&e, "attr_name") -> récupération de la première valeur de l'attribut
    Ok(rs.into_iter().map(|e| {
        let e = SearchEntry::construct(e);
        let members: Vec<Value> = e.attrs.get("member")
            .cloned().unwrap_or_default().into_iter().map(|m| json!(m)).collect();
        json!({
            "dn":          first_attr(&e, "distinguishedName"),
            "sam":         first_attr(&e, "sAMAccountName"),
            "name":        first_attr(&e, "name"),
            "description": first_attr(&e, "description"),
            "members":     members
        })
    }).collect())
}

// Récupération d'une liste d'unités organisationnelles
async fn get_ous(ldap: &mut ldap3::Ldap, base: &str) -> Result<Vec<Value>, String> {
    // On récupère les attributs pour chaque OU :
    // - DN pour le chemin complet de l'objet dans l'annuaire
    // - Nom d'affichage de l'OU
    // - Liens avec les GPO
    let attrs = vec!["distinguishedName", "name", "gPLink"];
    let (rs, _) = ldap.search(base, Scope::Subtree, "(objectClass=organizationalUnit)", attrs)
        .await.map_err(|e| format!("OUs LDAP : {}", e))?
        .success().map_err(|e| format!("Recherche OUs refusée : {}", e))?;
    // Le JSON obtenu dans cette fonction est plus petite que les autres
    // Comme on n'affiche que la position des OU (et éventuellement les GPO liés), par besoin de plus d'infos
    // first_attr(&e, "attr_name") -> récupération de la première valeur de l'attribut
    Ok(rs.into_iter().map(|e| {
        let e = SearchEntry::construct(e);
        json!({
            "dn":     first_attr(&e, "distinguishedName"),
            "name":   first_attr(&e, "name"),
            "gPLink": first_attr(&e, "gPLink")
        })
    }).collect())
}

// Récupère les GPOs depuis CN=Policies,CN=System,{base_dn}.
// Le GUID est stocké SANS accolades pour correspondre à ce qu'attend le frontend.
async fn get_gpo_nodes(ldap: &mut ldap3::Ldap, base_dn: &str) -> Result<Vec<Value>, String> {
    let policies_dn = format!("CN=Policies,CN=System,{}", base_dn); // Construit le DN de pase pour les GPOs
    // On récupère les attributs pour chaque GPO :
    // - DN pour le chemin complet de l'objet dans l'annuaire
    // - Nom d'affichage de la GPO
    // - Pour "name", c'est l'UUID entre accodales qui sera récupéré
    let attrs = vec!["distinguishedName", "displayName", "name"];
    // Recherche à partir du DN de base et recherche récursive dans tous les sous-conteneurs
    let (rs, _) = ldap.search(&policies_dn, Scope::OneLevel,
        "(objectClass=groupPolicyContainer)", attrs)
        .await.map_err(|e| format!("GPOs LDAP : {}", e))?
        .success().map_err(|e| format!("Recherche GPOs refusée : {}", e))?;

    // Transformation des résultats
    Ok(rs.into_iter().map(|e| {
        let e    = SearchEntry::construct(e);               // Conversion en SearchEntry de l'entrée brute
        let dn   = first_attr(&e, "distinguishedName");     // Extraction du DN
        // L'attribut `name` contient {GUID-AVEC-ACCOLADES} — on laisse le GUID en majuscules,
        // mais on retire les accolades (on évite les doubles accolades dans le JSON)
        let guid = first_attr(&e, "name")
            .trim_matches(|c: char| c == '{' || c == '}')
            .to_uppercase()
            .to_string();
        // Si disponible, on utilise le nom affiché de la GPO en récupérant la première valeur de l'attribut
        let label = {
            let d = first_attr(&e, "displayName");
            if d.is_empty() { guid.clone() } else { d }
        };
        // Là encore, le JSON obtenu dans cette fonction est petite à l'instar de get_ous
        // A noter que les noeuds GPO sont identifiés en tant que gpo-{GUID} dans l'abre JSON
        json!({
            "id":    format!("gpo-{}", guid),
            "label": label,
            "meta":  { "guid": guid, "dn": dn }
        })
    }).collect())
}

// ---------------------------------------------------------------------------
// Construction des liens GPO → OU
// C'est une fonction à part entière dédié à l'étape 6 du processus de
// collecte
// L'attribut gPLink de chaque OU permet de déterminer le lien
// ---------------------------------------------------------------------------
fn build_gpo_links(ous: &[Value], gpo_nodes: &[Value]) -> Vec<Value> {
    // On extrait l'ID du GPO à partir de la table de correspondance des GUID.
    let gpo_id_by_guid: HashMap<String, String> = gpo_nodes.iter()
        .filter_map(|g| {
            Some((g["meta"]["guid"].as_str()?.to_string(), g["id"].as_str()?.to_string()))
        })
        .collect();

    let mut links = Vec::new();     // Il s'agit d'une liste à part entière qui répertorie les liens GPO → OU

    // On parcout les unités d'organisation
    for ou in ous {
        // La chaîne gPLink de chaque OU est récupéré
        // Une chaîne vide est ignorée
        let gp_link = ou["gPLink"].as_str().unwrap_or("");
        if gp_link.is_empty() { continue; }

        // Un ID unique encodé en base64 est calculé à partir du DN
        // C'est ici que l'objet OU est identifié en tant que ou- dans l'arbre JSON
        let ou_dn = ou["dn"].as_str().unwrap_or("");
        let ou_id = format!("ou-{}", base64_encode(ou_dn));

        // La fin de la fonction analyse chaque référence GPO dans gPLink
        let mut remaining = gp_link;
        // La recherche cn={ ou CN={ est insensible à la casse en appelant find deux fois
        while let Some(start) = remaining.find("cn={").or_else(|| remaining.find("CN={")) {
            let after_cn = &remaining[start + 3..];
            if let Some(end) = after_cn.find('}') {
                // Extraire le GUID sans accolades, en majuscules
                let guid = after_cn[1..end].to_uppercase(); // [1..] saute l'accolade ouvrante
                // La table gpo_id_by_guid permet d'obtenur l'ID GPO correspondante
                // On crée alors un lien dans le JSON avec, dans l'ordre :
                // - ID interne du GPO
                // - ID généré de l'OU
                // - métadonnées (l'objet est, par ailleurs vide)
                if let Some(gpo_id) = gpo_id_by_guid.get(&guid) {
                    links.push(json!({ "source": gpo_id, "target": ou_id, "meta": {} }));
                }
                remaining = &after_cn[end + 1..];
            } else { break; }
        }
    }

    links
}

// -------------------------------------------------------------------------------
// Collecte SMB (étape 7 du processus de collecte)
// Les partages d'un serveur sont collectés via CIM/WinRM (PowerShell one-liner).
// -------------------------------------------------------------------------------
async fn collect_smb_shares(hostname: &str) -> Vec<Value> {
    // Étape 1 — récupérer la liste des partages
    // A partir d'une instance CIM, on se connecte à la machine Windows distante
    // On ne garde que les éléments de type 0 qui correspondent aux partages classiques
    // Les propriétés Name et Path sont gardés dans le JSON compressé en sortie
    let h = hostname.to_string();
    let cmd_shares = format!(
        "Get-CimInstance -ClassName Win32_Share -ComputerName '{h}' \
         | Where-Object {{ $_.Type -eq 0 }} \
         | Select-Object Name,Path \
         | ConvertTo-Json -Compress",
        h = hostname
    );
    let shares_json = tokio::task::spawn_blocking({
        let h = h.clone();
        move || run_ps_one_liner(&h, &cmd_shares)
    }).await.unwrap_or_default();

    // Analyse du flux JSON en valeurs Rust
    // serde_json::from_str sert à l'analyse du JSON obtenue via powershell
    // Gestion en toute sécurité des réponses contenant un seul objet ou tableau (vecteur vide si l'analyse échoue)
    let shares_array: Vec<Value> = match serde_json::from_str::<Value>(&shares_json) {
        Ok(Value::Array(arr)) => arr,
        Ok(obj @ Value::Object(_)) => vec![obj],
        _ => return vec![],
    };

    // Partages système à exclure (en plus des partages admin se terminant par $)
    // Elles n'ont que peu d'intérêt pour Graph'AD. On affiche surtout les partages dits "métiers".
    let system_shares = ["NETLOGON", "SYSVOL", "IPC$", "ADMIN$", "PRINT$"];
    let mut result = Vec::new();

    // Étape 2 — pour chaque partage, récupérer les permissions
    for sh in &shares_array {
        // Les deux méthodes récupèrent le nom du partage et leur chemin SMB
        let name = match sh["Name"].as_str() { Some(n) => n, None => continue };
        let path = sh["Path"].as_str().unwrap_or("");

        // Filtrer les partages admin (C$, D$...) et partages systèmes (définies dans la méthode system_shares)
        if name.ends_with('$') || system_shares.iter().any(|&s| s.eq_ignore_ascii_case(name)) {
            continue;
        }

        // On récupère les partages SMB en PowerShell one_lier
        let cmd_perms = format!(
            "Get-SmbShareAccess -Name '{n}' -CimSession '{h}' \
             | Select-Object AccountName,AccessRight \
             | ConvertTo-Json -Compress",
            n = name, h = hostname
        );
        let hn = hostname.to_string();
        let perms_json = tokio::task::spawn_blocking({
            let hn = hn.clone();
            move || run_ps_one_liner(&hn, &cmd_perms)
        }).await.unwrap_or_default();

        // A partir des permissions, on en construit la liste pour chaque partage
        let permissions: Vec<Value> = match serde_json::from_str::<Value>(&perms_json) {
            Ok(Value::Array(arr)) => arr.into_iter().filter_map(|p| {
                // On retire le préfixe domaine (BUILTIN\, LAN\, AUTORITE NT\...) qui n'a pas d'importance dans l'affichage final
                let group  = strip_domain_prefix(p["AccountName"].as_str().unwrap_or(""));
                // On récupère le droit d'accès du compte par rapport au passage associé
                // En réalité, ce seront des accès qui vont apparaître par groupe dans la vue Ressources
                let access = access_right_to_str(&p["AccessRight"]);
                if group.is_empty() { return None; }
                Some(json!({ "group": group, "access": access }))
            }).collect(),
            // Les partages par groupes vont être construit ici
            Ok(obj @ Value::Object(_)) => {
                let group  = strip_domain_prefix(obj["AccountName"].as_str().unwrap_or(""));
                let access = access_right_to_str(&obj["AccessRight"]);
                if group.is_empty() { vec![] }
                else { vec![json!({ "group": group, "access": access })] }
            }
            _ => vec![],
        };

        // Le JSON final des partages sera construit ici
        // A noter un format particulier pour les partages dans le JSON : share-{Share_Server}-{Share_name}
        // Le vrai chemin affiché dans la vue Ressources sera \\Share_Server\Share_name
        result.push(json!({
            "id":          format!("share-{}-{}", hostname, name),
            "label":       name,
            "path":        format!("\\\\{}\\{}", hostname, name),
            "localPath":   path,
            "permissions": permissions
        }));
    }

    result
}

/// La fonction suivante retire le préfixe domaine/builtin d'un nom de compte.
/// "BUILTIN\Administrateurs"     → "Administrateurs"
/// "LAN\GG_Commercial_Read_Lyon" → "GG_Commercial_Read_Lyon"
/// "Administrateurs"             → "Administrateurs"
// On évite alors les informations inutiles qui ne fera qu'embrouiller le manager.
fn strip_domain_prefix(account: &str) -> String {
    account.find('\\')
        .map(|i| account[i + 1..].to_string())
        .unwrap_or_else(|| account.to_string())
}

/// Exécute un one-liner PowerShell et retourne stdout (chaîne vide si erreur).
fn run_ps_one_liner(hostname: &str, cmd: &str) -> String {
    // Le process PowerShell s'exécute ainsi :
    // - Il n'y a pas d'interaction possible
    // - De toute façon, la fenêtre PowerShell ne s'affiche pas
    // - La politique d'exécution est temporairement levé jusqu'à fin d'exécution
    // - La commande fournie est exécuté avec le paramètre cmd
    let mut command = std::process::Command::new("powershell");
    command.args(["-NonInteractive", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Windows uniquement : empêcher l'apparition d'une fenêtre console
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    match command.output() {
        // Exécution réussi, on lit le résultat et on le retourne sous forme de chaîne de caractère
        // Avertissement : conversion en UTF-8 pour des questions de lisibilité
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout).trim().to_string()
        }
        // Erreur dans l'exécution : on ignore le partage SMB et on retourne une chaîne vide
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr);
            warn!("SMB [{}] ignoré : {}", hostname, err.trim());
            String::new()
        }
        // Se produit si PowerShell non disonible : là encore, on retourne une chaîne vide
        Err(e) => {
            warn!("SMB [{}] PowerShell introuvable : {}", hostname, e);
            String::new()
        }
    }
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

// On récupère la première valeur d'un attribut donné
// On la retourne ensuite sous forme de chaîne de caractère
fn first_attr(e: &SearchEntry, attr: &str) -> String {
    e.attrs.get(attr).and_then(|v| v.first()).cloned().unwrap_or_default()
}

// Le timestamp Windows FILETIME est récupéré et convertit en chaîne de caractère
// Le timestamp obtenu est formaté en ISO 8601 partiel
// Format de temps : dd/mm/aaa à hh/mm/ss
fn filetime_to_iso(ft: u64) -> Value {
    if ft == 0 || ft == 9_223_372_036_854_775_807 { return Value::Null; }
    let unix_secs = ft.saturating_sub(116_444_736_000_000_000) / 10_000_000;
    let dt = chrono::DateTime::from_timestamp(unix_secs as i64, 0)
        .unwrap_or(chrono::DateTime::UNIX_EPOCH);
    Value::String(dt.format("%Y-%m-%dT%H:%M:%S").to_string())
}

// Conversion d'une chaîne de caractère en base 64
// Utilisé notamment pour éviter des conflits entre utilisateurs
// On est, alors, censé obtenir un identifiant unique
fn base64_encode(s: &str) -> String {
    use std::fmt::Write;
    let bytes = s.as_bytes();
    let table = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    // On découpe en blocs de 3 octects
    // Chaque bloc est transformé en 4 caractères Base64 (6 bits chacun)
    // Un dernier bloc de moins de 3 octects est complété avec des zéros
    // Lors de la génération, les bits son décalés et combinés pour former 4 index dans la table Base64
    // Il manque des octets ? On les complète avec des =
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let _ = write!(out, "{}{}{}{}",
            table[b0 >> 2] as char,
            table[((b0 & 3) << 4) | (b1 >> 4)] as char,
            if chunk.len() > 1 { table[((b1 & 0xf) << 2) | (b2 >> 6)] as char } else { '=' },
            if chunk.len() > 2 { table[b2 & 0x3f] as char } else { '=' },
        );
    }
    out
}

// Extrait le DN du domaine pour avoir un véritable nom DNS.
fn dn_to_dns(dn: &str) -> String {
    dn.split(',')
        .filter_map(|p| {
            let p = p.trim();
            p.to_uppercase().starts_with("DC=").then(|| p[3..].to_string())
        })
        .collect::<Vec<_>>().join(".")
}

// Limite de dix archives par collecte pour éviter d'alourdir l'application.
// A partir de la onzième collecte, l'archive la plus ancienne est supprimée.
fn purge_old_archives(data_dir: &Path) {
    let mut files: Vec<_> = std::fs::read_dir(data_dir).ok()
        .map(|d| d.flatten()
            .filter(|e| {
                let n = e.file_name(); let n = n.to_string_lossy();
                n.starts_with("graphAD_") && n.ends_with(".json.enc")
            })
            .collect())
        .unwrap_or_default();
    files.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
    for old in files.iter().skip(10) { std::fs::remove_file(old.path()).ok(); }
}

/// Convertit AccessRight de Get-SmbShareAccess en chaîne normalisée.
/// Correspondance :
///   0 / "Full"   → "Full"    (translateAccess : "Contrôle total")
///   1 / "Change" → "Change"  (translateAccess : "Lecture & Écriture")
///   2 / "Read"   → "Read"    (translateAccess : "Lecture seule")
fn access_right_to_str(val: &Value) -> String {
    match val {
        // Cas texte : PS retourne "Full", "Read", "Change" — on passe tel quel
        Value::String(s) => s.clone(),
        // Cas entier : PS retourne 0, 1, 2
        Value::Number(n) => match n.as_u64().unwrap_or(99) {
            0 => "Full".to_string(),
            1 => "Change".to_string(),
            2 => "Read".to_string(),
            _ => "Unknown".to_string(),
        },
        _ => "Unknown".to_string(),
    }
}

// ---------------------------------------------------------------------------
// Gestion des archives (main.rs)
// ---------------------------------------------------------------------------

// Liste numéroté et horodaté des archives présents dans le dossier /data
pub fn list_archives_from(data_dir: &Path) -> Vec<ArchiveEntry> {
    let mut archives = Vec::new();  // Les entrées trouvées sont listés sous forme de liste
    let entries = match std::fs::read_dir(&data_dir) { Ok(e) => e, Err(_) => return archives };  // Le contenu du répertoire data est lu ici
    // Parcourt du répertoire
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if !name.starts_with("graphAD_") || !name.ends_with(".json.enc") { continue; }   // On garanti que seuls les fichiers commençants par "graphAD" et se terminant par .json.enc sont lus
        // Extraction de la date et de l'heure
        let stem  = name.trim_start_matches("graphAD_").trim_end_matches(".json.enc");
        let parts: Vec<&str> = stem.split('_').collect();
        // Le résultat obtenue permettra, par la suite, de créer une étiquette date / heure lisible (si le format est valide)
        let label = if parts.len() >= 2 {
            let (d, t) = (parts[0], parts[1]);
            if d.len() == 8 && t.len() == 6 {
                format!("{}/{}/{} à {}:{}:{}",
                    &d[6..8], &d[4..6], &d[0..4], &t[0..2], &t[2..4], &t[4..6])
            } else { name.clone() }
        } else { name.clone() };
        archives.push(ArchiveEntry { path: path.to_string_lossy().to_string(), label }); // On ajoute l'entrée dans la liste (chemin du fichier complet + étiquette formatée)
    }
    archives.sort_by(|a, b| b.path.cmp(&a.path)); // Tri par ordre chronologique inversé
    archives
}

// Définition publique du chemin relatif / absolu et de l'étiquette / du nom lisible
pub struct ArchiveEntry {
    pub path:  String,
    pub label: String,
}