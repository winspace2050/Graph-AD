// ====================================================================================
// utils.js - Fonctions utilitaires
//
// Ce sont des fonctions partagées entre tous les fichiers JavaScript du projet.
// Il est chargé en premier dans toutes les pages HTML (avant les composants UX).
// ====================================================================================

// Mise en évidence spécifique à la infrastructure dans l'arborescence
// après navigation depuis la barre de recherche ou en arrivant depuis
// les autres vues
function highlightInfraNodeById(nodeId) {
    // Le noeud cible doit d'abord exister
    const target = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!target) return false;

    // Remonter les parents et les déplier s'ils sont masqués
    let el = target.parentElement;
    while (el && el.id !== "infra-tree") {
        if (el.style.display === "none") {
            el.style.display = "block";
            // Changer la flèche ▶ en ▼ pour indiquer que le bloc est ouvert
            const sibling = el.previousElementSibling;
            if (sibling) {
                const arrow = sibling.querySelector("span");
                if (arrow && arrow.textContent === "▶") arrow.textContent = "▼";
            }
        }
        el = el.parentElement;
    }

    // Défilement fluide
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    // On applique un cadre bleue de mise en évidence pendant 2,5 secondes
    target.style.boxShadow = "0 0 0 4px #4A90D9";
    target.style.transition = "box-shadow 0.2s";
    setTimeout(() => { target.style.boxShadow = ""; }, 2500);

    return true;
}

// Mise en évidence lorsqu'on vient d'une recherche ou d'une autre vue
// Ce n'est pas le même comportement que la vue Infrastructure
function highlightNodeById(nodeId) {
    // On vérifie l'existence de l'élément dans le DOM avant de continuer
    const target = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (!target) return false;

    target.scrollIntoView({ behavior: "smooth", block: "center" });     // défilement fluide
    // Surlignage visuel
    const originalBg = target.style.background;
    target.style.background = "#bfddff";
    target.style.transition = "background 0.3s";
    // Au bout de 2,5 secondes, retour à l'état initiale
    setTimeout(() => { target.style.background = originalBg; }, 2500);

    return true;
}

// Protection XSS - Eviter que les caractères spéciaux soient interprétés comme des balises HTML
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// On convertit la date et l'heure brute au format ISO
function formatDateTime(value) {
    // En l'absence de valeur, on retourne "Jamais"
    if (!value) return "Jamais";
    const d = new Date(value);
    // Un format de date incorrecte est renvoyé en "Jamais"
    if (isNaN(d.getTime())) return "Jamais";
    // Le format de date qu'on retourne est jj/mm/aaaa à hh:mm:ss
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` +
           ` à ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Traduit une valeur de permission brute (provenant du JSON AD) en libellé lisible.
// Valeurs reconnues : 0/full/fullcontrol → Contrôle total
//                     1/change/modify    → Lecture & Écriture
//                     2/read             → Lecture seule
// Toute valeur non reconnue est retournée telle quelle.
function translateAccess(val) {
    const map = {
        "0":           "Contrôle total",
        "full":        "Contrôle total",
        "fullcontrol": "Contrôle total",
        "1":           "Lecture & Écriture",
        "change":      "Lecture & Écriture",
        "modify":      "Lecture & Écriture",
        "2":           "Lecture seule",
        "read":        "Lecture seule"
    };
    return map[String(val).toLowerCase()] || String(val);
}

// Normalise une chaîne pour la recherche : minuscules + suppression des accents.
// Utilisé dans les filtres de toutes les vues et dans le dashboard.
function normStr(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Déchiffrement du JSON en temps réel dans la session via Tauri
async function loadActiveFile() {
    // Récupération de la fonction invoke de Tauri
    // On priorise la nouvelle version de l'API (Tauri v2)
    const invoke = window.__TAURI__?.core?.invoke
                ?? window.__TAURI__?.invoke
                ?? (() => Promise.reject("Tauri indisponible"));

    // Récupération du chemin du fichier actif
    const path = sessionStorage.getItem("_gad_active_file");
    if (!path) throw new Error("Aucun fichier actif en session.");

    // Appel d’une commande Rust pour lire et déchiffrer le JSON
    const bytes = await invoke("cmd_read_enc_file", { path });
    const blob  = new Blob([new Uint8Array(bytes)]);
    const url   = URL.createObjectURL(blob);
    try {
        return await GraphADCrypto.loadAndDecrypt(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}