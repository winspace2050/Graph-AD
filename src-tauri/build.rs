// build.rs — Point d'entrée de compilation requis par Tauri.
// Sans ce fichier, les assets HTML/CSS/JS ne sont pas embarqués dans le binaire.
// Tauri s'en sert pour générer les bindings entre le frontend et le backend Rust.
fn main() {
    tauri_build::build()
}