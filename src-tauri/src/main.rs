// =============================================================================
// main.rs — Orchestrateur de Graph'AD
//
// C'est lui qui orchestre tout. Tous les modules du dossier /src sont liés
// à ce fichier ce qui permet une meilleure gestion. Chaque module peut être
// ajouté à ce fichier à tout moment à condition qu'il soit déclaré ici.
//
// Tauri prend en charge :
//   - L'ouverture de la fenêtre graphique (WebView)
//   - Le routage des appels JS → Rust via les commandes (#[tauri::command])
//   - L'embarquement des assets HTML/CSS/JS dans le binaire final
//
// A noter que main.rs est lancé à partir de build.rs qui est le point d'entrée
// de Graph'AD.
// =============================================================================

#![windows_subsystem = "windows"]

// Les 2 modules ci-dessous sont tous référencés dans le dossier /src
mod collector;
mod crypto;

// Appel des dépendances
use tracing_subscriber::{EnvFilter};
use tracing::{Event, Subscriber};
use tracing_subscriber::fmt::{FmtContext, FormatEvent, FormatFields};
use tracing_subscriber::registry::LookupSpan;
use zeroize::Zeroize;
use tauri::Emitter;

struct GraphADFormatter;

impl<S, N> FormatEvent<S, N> for GraphADFormatter
where
    S: Subscriber + for<'a> LookupSpan<'a>,
    N: for<'a> FormatFields<'a> + 'static,
{
    fn format_event(
        &self,
        ctx: &FmtContext<'_, S, N>,
        mut writer: tracing_subscriber::fmt::format::Writer<'_>,
        event: &Event<'_>,
    ) -> std::fmt::Result {
        // Date et heure
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");

        // Niveau des logs
        let level = match *event.metadata().level() {
            tracing::Level::ERROR => "ERROR",
            tracing::Level::WARN  => "WARN",
            tracing::Level::INFO  => "INFO",
            tracing::Level::DEBUG => "DEBUG",
            tracing::Level::TRACE => "TRACE",
        };

        // Module → label lisible
        // "graphad" → "GRAPHAD"
        // "graphad::collector" → "GRAPHAD - COLLECTOR"
        // "ldap3::conn" → "LDAP3 - CONN"
        let target = event.metadata().target();
        let label = target
            .split("::")
            .map(|s| s.to_uppercase())
            .collect::<Vec<_>>()
            .join(" - ");

        write!(writer, "[{}] [{}] [{}] ", now, label, level)?;
        ctx.field_format().format_fields(writer.by_ref(), event)?;
        writeln!(writer)
    }
}

fn main() {
    // Calculer log_dir avant Tauri pour initialiser les logs le plus tôt possible
    let log_path = {
        #[cfg(debug_assertions)]
        { project_root().join("logs") }
        #[cfg(not(debug_assertions))]
        {
            std::env::current_exe()
                .unwrap_or_default()
                .parent()
                .unwrap_or(std::path::Path::new("."))
                .join("logs")
        }
    };
    std::fs::create_dir_all(&log_path).ok();
    let _guard = init_logging(&log_path);

    tracing::info!("================ Graph'AD démarrage ================");

    check_admin(); // Vérification des permissions admins

    tauri::Builder::default()
        // Commandes Tauri
        .invoke_handler(tauri::generate_handler![
            cmd_list_data_files,
            cmd_delete_data_file,
            cmd_read_enc_file,
            cmd_start_collect,
            cmd_check_active_directory,
            cmd_quit,
        ])
        .on_window_event(|_window, event| {
            // Capturer la fermeture de la fenêtre (croix ou cmd_quit)
            if let tauri::WindowEvent::Destroyed = event {
                tracing::info!("================ Graph'AD fermeture ================");
            }
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors du démarrage de Graph'AD");
}

// Journalisation dans un fichier de logs
// Le fichier de log suivra le schéma graphad.aaaa-mm-dd.log
fn init_logging(log_dir: &std::path::Path) -> tracing_appender::non_blocking::WorkerGuard {
    let file_appender = tracing_appender::rolling::RollingFileAppender::builder()
        .rotation(tracing_appender::rolling::Rotation::DAILY)
        .filename_prefix("graphad")
        .filename_suffix("log")
        .build(log_dir)
        .expect("Impossible d'initialiser les logs");

    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info"))
        )
        .event_format(GraphADFormatter)
        .with_writer(non_blocking)
        .init();

    guard
}

// ==============================================================================
// Commandes Tauri — appelées depuis le JavaScript via window.__TAURI__.invoke()
// ==============================================================================

/// Retourne la liste des fichiers .enc dans le dossier /data,
/// triée du plus récent au plus ancien, avec le chemin absolu et l'étiquette
/// lisible (ex : "13/03/2026 à 14:32:01").
#[tauri::command]
fn cmd_list_data_files(app: tauri::AppHandle) -> Vec<DataFileEntry> {
    let data_dir = data_dir(&app);
    collector::list_archives_from(&data_dir)
        .into_iter()
        .map(|a| DataFileEntry { path: a.path, label: a.label })
        .collect()
}

/// Supprime un fichier .enc dans /data.
/// Retourne une erreur si le fichier n'existe pas ou n'est pas dans /data.
#[tauri::command]
fn cmd_delete_data_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    // Sécurité : vérifier que le chemin est bien dans /data avant de supprimer
    let data_dir = data_dir(&app);
    let target = std::path::Path::new(&path);
    if !target.starts_with(&data_dir) {
        return Err("Chemin non autorisé.".to_string());
    }
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

/// Lit un fichier .enc et retourne son contenu en bytes bruts.
/// Utilisé par crypto.js pour déchiffrer le JSON en mémoire côté navigateur.
/// Le chemin doit pointer vers un fichier dans /data.
#[tauri::command]
fn cmd_read_enc_file(app: tauri::AppHandle, path: String) -> Result<Vec<u8>, String> {
    let data_dir = data_dir(&app);
    let target = std::path::Path::new(&path);
    if !target.starts_with(&data_dir) {
        return Err("Chemin non autorisé.".to_string());
    }
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// Lance la collecte Active Directory.
/// Émet des événements "collect-progress" au fur et à mesure des étapes.
/// La passphrase est effacée de la mémoire dès que la collecte est terminée.
///
/// Retourne Ok(()) si la collecte s'est bien passée, Err(message) sinon.
#[tauri::command]
async fn cmd_start_collect(
    app: tauri::AppHandle,
    mut passphrase: String,
) -> Result<(), String> {
    // Vérifier AD avant de spawner
    if !is_active_directory_present() {
        tracing::error!("Collecte demandée sans Active Directory détecté");
        passphrase.zeroize();
        return Err(
            "Active Directory n'est pas installé sur cette machine.\n\
             La collecte doit être lancée depuis un contrôleur de domaine.".to_string()
        );
    }

    let data_dir = data_dir(&app);

    // Spawner la collecte dans un thread séparé — retour immédiat au JS
    // La progression est communiquée via les événements "collect-progress"
    // La fin via "collect-done" ou "collect-error"
    tokio::spawn(async move {
        match collector::collect_with_events(app.clone(), &data_dir, &passphrase).await {
            Ok(_)  => { let _ = app.emit("collect-done", ()); }
            Err(e) => {
                tracing::error!("Erreur de collecte : {}", e);
                let _ = app.emit("collect-error", e); }
        }
        passphrase.zeroize();
    });

    Ok(()) // ← retourne immédiatement, sans attendre la fin de la collecte
}

/// Vérifie si Active Directory est présent sur cette machine.
/// Retourne true si le service NTDS tourne ou si le dossier NTDS existe.
#[tauri::command]
fn cmd_check_active_directory() -> bool {
    is_active_directory_present()
}

/// Ferme proprement l'application.
#[tauri::command]
fn cmd_quit(app: tauri::AppHandle) {
    app.exit(0);
}

// =============================================================================
// Fonctions utilitaires internes
// =============================================================================

#[cfg(debug_assertions)]
fn project_root() -> std::path::PathBuf {
    // En dev, stocker data/ et logs/ dans un dossier temporaire
    // hors du projet pour éviter les rechargements intempestifs
    let tmp = std::env::temp_dir().join("graphad_dev");
    std::fs::create_dir_all(&tmp).ok();
    tmp
}

// Stockage des archives dans data/
fn data_dir(_app: &tauri::AppHandle) -> std::path::PathBuf {
    #[cfg(debug_assertions)]
    {
        // En debug, data/ est dans %temp%
        let dir = project_root().join("data");
        std::fs::create_dir_all(&dir).ok();
        return dir;
    }
    #[cfg(not(debug_assertions))]
    {
        // En release : data/ est à côté de l'exe
        let dir = std::env::current_exe()
            .unwrap_or_default()
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("data");
        std::fs::create_dir_all(&dir).ok();
        dir
    }
}

/// Vérifie si l'utilisateur a les droits administrateur.
/// Affiche un message d'erreur et quitte si ce n'est pas le cas.
fn check_admin() {
    #[cfg(target_os = "windows")]
    {
        let is_admin = unsafe {
            match libloading::Library::new("shell32.dll") {
                Ok(lib) => {
                    let func: Result<libloading::Symbol<unsafe extern "system" fn() -> i32>, _> =
                        lib.get(b"IsUserAnAdmin\0");
                    match func {
                        Ok(f) => f() != 0,
                        Err(_) => false,
                    }
                }
                Err(_) => false,
            }
        };

        if !is_admin {
            // En mode GUI, pas de terminal — on utilise une MessageBox Windows
            // pour informer l'utilisateur avant de quitter.
            unsafe {
                if let Ok(lib) = libloading::Library::new("user32.dll") {
                    let msg_box: Result<
                        libloading::Symbol<
                            unsafe extern "system" fn(*const i8, *const i8, *const i8, u32) -> i32,
                        >,
                        _,
                    > = lib.get(b"MessageBoxA\0");
                    if let Ok(f) = msg_box {
                        let title = "Insufficient rights\0";
                        let text  = "The Graph'AD software must be run as an administrator.\n\
                                     Right-click on graphad.exe -> Run as administrator.\0";
                        f(std::ptr::null(), text.as_ptr() as _, title.as_ptr() as _, 0x10);
                    }
                }
            }
            tracing::error!("Droits administrateur manquants — fermeture"); // Log de droits d'admins non respectés
            std::process::exit(1);
        }
    }
}

/// Détecte si Active Directory Domain Services est installé sur cette machine.
fn is_active_directory_present() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Méthode 1 — clé registre NTDS::Parameters (présente si AD DS est installé)
        // On passe par reg.exe avec stdout redirigé explicitement
        let mut cmd = std::process::Command::new("reg");
        cmd.args(["query", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\NTDS\\Parameters"])
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::null());
        #[cfg(target_os = "windows")]
        { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
        let reg_ok = cmd.output().map(|o| o.status.success()).unwrap_or(false);

        if reg_ok { return true; }

        // Méthode 2 — dossier NTDS à la racine Windows
        let root = std::env::var("SystemRoot")
            .unwrap_or_else(|_| "C:\\Windows".to_string());
        if std::path::Path::new(&root).join("NTDS").exists() {
            return true;
        }

        // Méthode 3 — service NTDS actif (sc query retourne RUNNING uniquement si AD tourne)
        let mut cmd = std::process::Command::new("sc");
        cmd.args(["query", "NTDS"])
           .stdout(std::process::Stdio::piped())
           .stderr(std::process::Stdio::null());
        { use std::os::windows::process::CommandExt; cmd.creation_flags(0x08000000); }
        if let Ok(out) = cmd.output() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            return stdout.contains("RUNNING");
        }

        false
    }
    #[cfg(not(target_os = "windows"))]
    { false }
}

// =============================================================================
// Types partagés avec le frontend
// =============================================================================

/// Entrée de la liste des fichiers .enc affichée sur l'écran d'accueil.
#[derive(serde::Serialize)]
pub struct DataFileEntry {
    pub path:  String,  // chemin absolu vers le fichier .enc
    pub label: String,  // étiquette lisible : "13/03/2026 à 14:32:01"
}
