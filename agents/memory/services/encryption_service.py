"""
encryption_service.py — Chiffrement AES-256-GCM pour les données ChromaDB

La clé est dérivée de CHIMERA_MASTER_KEY (env) via PBKDF2.
Si absent, utilise HUD_TOKEN. Si absent aussi, génère et stocke une clé
aléatoire dans .laruche/encryption.key (lisible seulement par le process).

IMPORTANT : Si CHIMERA_ENCRYPTION_ENABLED=false (défaut), le chiffrement
est DÉSACTIVÉ pour rétrocompatibilité. Les données existantes ne sont pas
migrées automatiquement.
"""

from __future__ import annotations

import base64
import os
import secrets
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# ─── Configuration ────────────────────────────────────────────────────────────

ENCRYPTION_ENABLED = os.getenv("CHIMERA_ENCRYPTION_ENABLED", "false").lower() == "true"

# Salt fixe et public — la sécurité repose uniquement sur la clé maître
SALT = b"chimera-memory-v1"

# Fichier de clé générée automatiquement (si aucune variable d'env n'est définie)
KEY_FILE = (
    Path(os.getenv("CHIMERA_HOME", str(Path.home() / ".laruche"))) / "encryption.key"
)


# ─── Service ──────────────────────────────────────────────────────────────────


class EncryptionService:
    """
    Service de chiffrement AES-256-GCM pour les documents ChromaDB.

    Usage :
        from agents.memory.services.encryption_service import encryption_service

        # Chiffrement avant insert ChromaDB
        doc = encryption_service.encrypt_document(doc)

        # Déchiffrement après query ChromaDB
        doc = encryption_service.decrypt_document(doc)
    """

    def __init__(self):
        # Cache de la clé dérivée (évite de recalculer 100 000 itérations PBKDF2)
        self._key: bytes | None = None
        self._enabled = ENCRYPTION_ENABLED

    @property
    def enabled(self) -> bool:
        """Retourne True si le chiffrement est activé via CHIMERA_ENCRYPTION_ENABLED."""
        return self._enabled

    def get_key(self) -> bytes:
        """
        Retourne la clé AES-256 (32 bytes).

        Ordre de priorité :
          1. CHIMERA_MASTER_KEY (variable d'environnement)
          2. HUD_TOKEN (réutilisation du token d'authentification HUD)
          3. Clé aléatoire persistée dans KEY_FILE (~/.laruche/encryption.key)
        """
        if self._key is not None:
            return self._key
        master_raw = (
            os.getenv("CHIMERA_MASTER_KEY")
            or os.getenv("HUD_TOKEN")
            or self._load_or_generate_key()
        )
        master_bytes = master_raw.encode() if isinstance(master_raw, str) else master_raw
        self._key = self._derive_key(master_bytes)
        return self._key

    def _derive_key(self, master: bytes) -> bytes:
        """
        Dérive une clé AES-256 (32 bytes) depuis le secret maître.
        Utilise PBKDF2-HMAC-SHA256 avec 100 000 itérations.
        """
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=SALT,
            iterations=100_000,
        )
        return kdf.derive(master)

    def _load_or_generate_key(self) -> str:
        """
        Charge la clé depuis KEY_FILE, ou en génère une nouvelle et la persiste.
        Le fichier est créé avec les permissions 0o600 (lecture propriétaire uniquement).
        """
        KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
        if KEY_FILE.exists():
            return KEY_FILE.read_text(encoding="utf-8").strip()
        # Génération d'une clé aléatoire 256 bits en hex
        key = secrets.token_hex(32)
        KEY_FILE.write_text(key, encoding="utf-8")
        KEY_FILE.chmod(0o600)
        return key

    def encrypt(self, plaintext: str) -> str:
        """
        Chiffre une chaîne de caractères.

        Format de sortie : base64(nonce[12] + ciphertext + tag[16])
        Le tag GCM (16 bytes) est inclus dans le ciphertext retourné par AESGCM.

        Si le chiffrement est désactivé, retourne le texte tel quel.
        """
        if not self._enabled:
            return plaintext
        nonce = secrets.token_bytes(12)  # 96 bits — recommandé pour AES-GCM
        aesgcm = AESGCM(self.get_key())
        # AESGCM.encrypt retourne ciphertext + tag (tag de 16 bytes en suffixe)
        ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        return base64.b64encode(nonce + ct).decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        """
        Déchiffre une chaîne chiffrée par encrypt().

        Si le déchiffrement échoue (données legacy non chiffrées, mauvaise clé,
        données corrompues), retourne la valeur telle quelle sans lever d'exception.

        Si le chiffrement est désactivé, retourne le texte tel quel.
        """
        if not self._enabled:
            return ciphertext
        try:
            raw = base64.b64decode(ciphertext)
            # Les 12 premiers bytes sont le nonce, le reste est ciphertext + tag
            nonce, ct = raw[:12], raw[12:]
            aesgcm = AESGCM(self.get_key())
            return aesgcm.decrypt(nonce, ct, None).decode("utf-8")
        except Exception:
            # Fallback gracieux : données legacy ou non chiffrées → retourner tel quel
            return ciphertext

    def encrypt_document(self, doc: dict) -> dict:
        """
        Chiffre les champs textuels d'un document ChromaDB.

        Seuls les champs "content" et "text" (str) sont chiffrés.
        Les autres champs (id, metadata, embeddings…) restent inchangés.
        """
        if not self._enabled:
            return doc
        result = dict(doc)
        if "content" in result and isinstance(result["content"], str):
            result["content"] = self.encrypt(result["content"])
        if "text" in result and isinstance(result["text"], str):
            result["text"] = self.encrypt(result["text"])
        return result

    def decrypt_document(self, doc: dict) -> dict:
        """
        Déchiffre les champs textuels d'un document ChromaDB.

        Même champs que encrypt_document. Fallback gracieux si données legacy.
        """
        if not self._enabled:
            return doc
        result = dict(doc)
        if "content" in result and isinstance(result["content"], str):
            result["content"] = self.decrypt(result["content"])
        if "text" in result and isinstance(result["text"], str):
            result["text"] = self.decrypt(result["text"])
        return result

    def reset_key_cache(self) -> None:
        """Vide le cache de la clé dérivée (utile pour la rotation de clé en tests)."""
        self._key = None


# ─── Singleton ────────────────────────────────────────────────────────────────

# Instance partagée par tous les modules qui importent ce service
encryption_service = EncryptionService()
