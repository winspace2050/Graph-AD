// ============================================================================
// crypto.js : déchiffrement du JSON et génération d'une clé de session.
//
// -> Algorithme de chiffrement : AES-256-CBC
// -> Algorithme de hachage : HMAC-SHA256
// ============================================================================

window.GraphADCrypto = {

    _passphrase: null,

    // Utilisé pour obfusquer la phrase en sessionStorage (protection mémoire navigateur)
    // Ce n'est pas du chiffrement — la vraie sécurité repose sur PBKDF2 + AES-256-CBC
    _xor(data, key) {
        return data.map((b, i) => b ^ key[i % key.length]);
    },

    // On récupère la phrase de passe et on fait les initialisations
    async initFromPassphrase(passphrase) {
        this._passphrase = passphrase;
        // On hache la phrase de passe en SHA-256
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const hashBuf = await crypto.subtle.digest("SHA-256", salt);
        // On génère une clé de session en base 64 xoré
        const xorKey  = new Uint8Array(hashBuf);
        const encoded = new TextEncoder().encode(passphrase);
        const obf     = this._xor(encoded, xorKey);
        const toB64 = b => btoa(String.fromCharCode(...b));
        // Le tout sera stocké dans la session
        sessionStorage.setItem("_gad_s", toB64(salt));
        sessionStorage.setItem("_gad_p", toB64(obf));
    },

    // Vérification si la phrase de passe existe déjà
    async _restorePassphrase() {
        // Si la phrase de passe est déjà en mémoire, l'utilisateur passe
        if (this._passphrase) return true;
        // Si les clés de session existent, l'utilisateur passe
        const s = sessionStorage.getItem("_gad_s");
        const p = sessionStorage.getItem("_gad_p");
        if (!s || !p) return false;
        try {
            // Lorsque l'utilisateur est authentifié, on "décode" la clé de session
            const fromB64 = b => new Uint8Array([...atob(b)].map(c => c.charCodeAt(0)));
            const salt    = fromB64(s);
            const obf     = fromB64(p);
            const hashBuf = await crypto.subtle.digest("SHA-256", salt);
            const xorKey  = new Uint8Array(hashBuf);
            const decoded = this._xor(obf, xorKey);
            this._passphrase = new TextDecoder().decode(decoded);
            return true;
        } catch { return false; }
    },

    // Méthode booléenne qui vérifie si l'utilisateur est vrai. Retourne faux si absence de _passphrase ou de clé de session
    isAuthenticated() {
        return !!(this._passphrase ||
            (sessionStorage.getItem("_gad_s") && sessionStorage.getItem("_gad_p")));
    },

    // Dérivation de la clé en utilisant PBKDF2 : on sécurise véritablement la clé
    async _deriveKey(salt, usage) {
        // La phrase de passe est stocké en clé brute avec PBKDF2
        const raw = await crypto.subtle.importKey(
            "raw", new TextEncoder().encode(this._passphrase),
            "PBKDF2", false, ["deriveKey"]
        );
        // Phrase de dérivation de la clé
        // On obtient alors une clé pour signer ou déchiffrer
        // La clé n'est pas extractable pour des questions de sécurité
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
            raw,
            // Pour un usage HMAC : on crée la clé HMAC pour signature
            // Sinon, on utilise une clé AES-CBC pour déchiffrer le JSON
            usage === "hmac"
                ? { name: "HMAC", hash: "SHA-256", length: 256 }
                : { name: "AES-CBC", length: 256 },
            false,
            usage === "hmac" ? ["sign"] : ["decrypt"]
        );
    },

    // La fonction loadAndDecrypt se résume en plusieurs étape :
    // 1) L'utilisateur est authentifié.
    // 2) On charge le JSON chiffré.
    // 3) Les données du JSON sont intègres.
    // 4) Le JSON est déchiffré avec la méthode AES-CBC.
    // 5) On retourne les données parsées en JSON
    async loadAndDecrypt(url) {
        // Ce premier bloc vérifie si l'utilisateur est authentifié
        // Sinon, réinitialisation d'état de session et on le redige vers la page de connexion
        const ok = await this._restorePassphrase();
        if (!ok) {
            this.clear();
            this._redirectToLogin()
            throw new Error("Non authentifié");
        }

        // A partir de l'URL, le JSON chiffré est récupéré pour un traitement binaire
        const res = await fetch(url);
        if (!res.ok) throw new Error("Fichier introuvable : " + url);
        const data = new Uint8Array(await res.arrayBuffer());

        // Extraction des composants du JSON chiffré
        // Format : saltEnc(16) + iv(16) + saltHmac(16) + hmac(32) + ciphertext
        // Format binaire : saltEnc(16) | iv(16) | saltHmac(16) | hmac(32) | ciphertext(variable)
        // Taille minimale attendue : 80 octets
        const saltEnc  = data.slice(0, 16);
        const iv       = data.slice(16, 32);
        const saltHmac = data.slice(32, 48);
        const hmac     = data.slice(48, 80);
        const cipher   = data.slice(80);

        // On vérifie si les données sont intègres par dérivation de la clé HMAC
        const keyHmac     = await this._deriveKey(saltHmac, "hmac");
        // Construire un buffer qui concatène saltEnc + iv + saltHmac + cipher
        const hmacData = new Uint8Array(saltEnc.length + iv.length + saltHmac.length + cipher.length);
        hmacData.set(saltEnc,  0);
        hmacData.set(iv,       16);
        hmacData.set(saltHmac, 32);
        hmacData.set(cipher,   48);
        const expectedSig = await crypto.subtle.sign("HMAC", keyHmac, hmacData);
        const expected    = new Uint8Array(expectedSig);
        const valid = hmac.length === expected.length &&
            hmac.every((b, i) => b === expected[i]);

        // Une modification du HMAC ou une phrase de passe incorrecte entraine un refus d'authentification
        // La session est nettoyée et l'utilisateur est immédiatement déconnecté avant d'avoir accès aux autres pages
        if (!valid) {
            this.clear();
            this._redirectToLogin()
            throw new Error("HMAC invalide — fichier altéré ou phrase incorrecte");
        }

        // On déchiffre les données du JSON
        const keyEnc = await this._deriveKey(saltEnc, "enc");       // Clé de déchiffrement dérivé de saltEnc
        // AES-CBC sera la méthode de déchiffrement utilisée pour déchiffrer le JSON
        try {
            const dec = await crypto.subtle.decrypt(
                { name: "AES-CBC", iv }, keyEnc, cipher
            );
            return JSON.parse(new TextDecoder().decode(dec));
        // Si le déchiffrement échoue, une authentification est demandé
        // La session est nettoyée et l'utilisateur est immédiatement déconnecté
        } catch {
            this.clear();
            this._redirectToLogin()
            throw new Error("Déchiffrement échoué");
        }
    },

    // Efface les clés présents en stockage de session
    clear() {
        this._passphrase = null;
        sessionStorage.removeItem("_gad_s");
        sessionStorage.removeItem("_gad_p");
    },
   
    // Un utilisateur tente d'accéder à Graph'AD sans authentification : on le redirige sur la page d'accueil
    _redirectToLogin() {
        // Détecter si on est dans un sous-dossier views/
        const homePath = window.location.pathname.includes("/views/")
            ? "../home.html"
            : "home.html";
        window.location.replace(loginPath);
    },
};