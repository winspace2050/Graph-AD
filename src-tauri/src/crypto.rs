// =============================================================================
// crypto.rs — Chiffrement AES-256-CBC + HMAC-SHA-256
//
// Format du fichier .enc produit :
//   [0..16]  saltEnc   — sel PBKDF2 pour la clé AES
//   [16..32] iv        — vecteur d'initialisation AES-CBC
//   [32..48] saltHmac  — sel PBKDF2 pour la clé HMAC
//   [48..80] hmac      — signature HMAC-SHA-256 (32 octets)
//   [80..]   ciphertext — données chiffrées AES-256-CBC + PKCS7
//
// PBKDF2 : SHA-256, 200 000 itérations, clé 32 octets.
// Ce format est lu par crypto.js côté navigateur — ne pas modifier.
// =============================================================================

// Appel des dépendances
use aes::cipher::BlockModeEncrypt;
use aes::Aes256;
use cbc::Encryptor;
use cbc::cipher::{KeyIvInit, block_padding::Pkcs7};
use hmac::{Hmac, Mac, KeyInit};
use pbkdf2::pbkdf2_hmac;
use rand::Rng;
use sha2::Sha256;
use zeroize::Zeroize;

// Deux types Rust personnalisés sont définies
type Aes256CbcEnc = Encryptor<Aes256>;  // Utilisé pour le chiffrement AES-256 en mode CBC
type HmacSha256   = Hmac<Sha256>;       // Utilisé pour le code HMAC basé sur SHA-256

/// Chiffre `json_bytes` avec la phrase de passe fournie.
/// Retourne le blob binaire prêt à écrire dans `graphAD.json.enc`.
pub fn encrypt(json_bytes: &[u8], passphrase: &str) -> Vec<u8> {
    let pass_bytes = passphrase.as_bytes();

    // Génération des aléas cryptographiques
    let mut salt_enc  = [0u8; 16];
    let mut salt_hmac = [0u8; 16];
    let mut iv        = [0u8; 16];
    let mut rng = rand::rng();
    rng.fill_bytes(&mut salt_enc);
    rng.fill_bytes(&mut salt_hmac);
    rng.fill_bytes(&mut iv);

    // Dériver la clé AES (200 000 itérations)
    let mut key_enc = [0u8; 32];
    pbkdf2_hmac::<Sha256>(pass_bytes, &salt_enc, 200_000, &mut key_enc);

    // Dériver la clé HMAC
    let mut key_hmac = [0u8; 32];
    pbkdf2_hmac::<Sha256>(pass_bytes, &salt_hmac, 200_000, &mut key_hmac);

    // Chiffrement AES-256-CBC + PKCS7
    let cipher = Aes256CbcEnc::new(&key_enc.into(), &iv.into());
    let ciphertext = cipher.encrypt_padded_vec::<Pkcs7>(json_bytes);

    // Effacer la clé AES de la mémoire dès qu'on n'en a plus besoin
    key_enc.zeroize();

    // Signature HMAC-SHA-256 sur la totalité des données
    let mut mac = HmacSha256::new_from_slice(&key_hmac)
        .expect("HMAC accepte toute longueur de clé");
    mac.update(&salt_enc);
    mac.update(&iv);
    mac.update(&salt_hmac);
    mac.update(&ciphertext);
    let hmac_bytes = mac.finalize().into_bytes();

    // Effacer la clé HMAC de la mémoire dès qu'on n'en a plus besoin
    key_hmac.zeroize();

    // Assemblage final : saltEnc(16) | iv(16) | saltHmac(16) | hmac(32) | ciphertext
    let mut output = Vec::with_capacity(80 + ciphertext.len());
    output.extend_from_slice(&salt_enc);
    output.extend_from_slice(&iv);
    output.extend_from_slice(&salt_hmac);
    output.extend_from_slice(&hmac_bytes);
    output.extend_from_slice(&ciphertext);

    output
}