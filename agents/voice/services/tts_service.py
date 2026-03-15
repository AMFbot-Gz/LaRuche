"""
services/tts_service.py — Text-to-Speech (TTS)

Stratégie de backends (en ordre de priorité) :
  1. piper-tts — synthèse vocale locale, rapide, voix naturelles
     → pip install piper-tts
  2. macOS say — commande système, disponible sur tout Mac sans installation
     → toujours disponible sur macOS, produit du AIFF

Architecture :
  - Détection automatique du backend disponible au démarrage
  - synthesize() retourne des bytes audio bruts (AIFF ou WAV)
  - Les bytes sont ensuite encodés en base64 par l'endpoint FastAPI

Utilisation :
    audio_bytes = await synthesize("Bonjour Chimera", voice=None)
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Disponibilité piper-tts ──────────────────────────────────────────────────

try:
    import piper  # type: ignore
    _PIPER_AVAILABLE = True
    logger.info("piper-tts disponible")
except ImportError:
    _PIPER_AVAILABLE = False
    logger.info(
        "piper-tts non disponible — TTS via macOS say. "
        "Installez via : pip install piper-tts"
    )

# ─── Disponibilité macOS say ──────────────────────────────────────────────────

_MACOS_SAY_AVAILABLE = platform.system() == "Darwin"


# ─── Synthèse principale ──────────────────────────────────────────────────────


async def synthesize(
    text: str,
    voice: Optional[str] = None,
    fmt: str = "aiff",
) -> bytes:
    """
    Synthétise du texte en audio.

    Tente piper-tts en premier. Si indisponible, utilise macOS say.
    La synthèse est bloquante → exécutée dans un thread pour ne pas bloquer asyncio.

    Args:
        text  : texte à synthétiser
        voice : nom de voix (ex: 'Amelie' pour macOS say, chemin modèle piper)
        fmt   : format de sortie audio ('aiff' ou 'wav')

    Returns:
        bytes : contenu du fichier audio

    Raises:
        RuntimeError : si aucun backend TTS n'est disponible
    """
    loop = asyncio.get_event_loop()

    if _PIPER_AVAILABLE:
        return await loop.run_in_executor(None, _synthesize_piper, text, voice, fmt)

    if _MACOS_SAY_AVAILABLE:
        return await loop.run_in_executor(None, _synthesize_macos_say, text, voice, fmt)

    raise RuntimeError(
        "Aucun backend TTS disponible. "
        "Sur macOS : la commande 'say' devrait être disponible. "
        "Installez piper-tts via : pip install piper-tts"
    )


# ─── Backend piper-tts ────────────────────────────────────────────────────────


def _synthesize_piper(
    text: str,
    voice: Optional[str],
    fmt: str,
) -> bytes:
    """
    Synthèse via piper-tts.

    piper nécessite un modèle .onnx téléchargé localement.
    Si le modèle n'est pas trouvé, fallback automatique sur macOS say.
    """
    try:
        # piper-tts s'utilise en CLI : piper --model <path> --output_file <out>
        # On passe par subprocess pour une compatibilité maximale
        suffix = ".wav" if fmt == "wav" else ".aiff"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            out_path = f.name

        # Construction de la commande piper
        cmd = ["piper", "--output_file", out_path]
        if voice:
            cmd += ["--model", voice]

        # Piper lit depuis stdin
        result = subprocess.run(
            cmd,
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise RuntimeError(f"piper stderr: {result.stderr.decode()}")

        with open(out_path, "rb") as f:
            audio = f.read()

        return audio

    except (FileNotFoundError, RuntimeError) as exc:
        logger.warning("piper-tts échoué (%s), fallback sur macOS say", exc)
        if _MACOS_SAY_AVAILABLE:
            return _synthesize_macos_say(text, voice, fmt)
        raise

    finally:
        try:
            if "out_path" in dir() and os.path.exists(out_path):
                os.unlink(out_path)
        except OSError:
            pass


# ─── Backend macOS say ────────────────────────────────────────────────────────


def _synthesize_macos_say(
    text: str,
    voice: Optional[str],
    fmt: str,
) -> bytes:
    """
    Synthèse vocale via la commande macOS `say`.

    `say` est disponible nativement sur tout Mac.
    Produit un fichier AIFF par défaut.

    Args:
        text  : texte à synthétiser
        voice : nom de voix macOS (ex: 'Amelie', 'Thomas', 'Alex'). None = voix système.
        fmt   : format de sortie ('aiff' recommandé, natif macOS say)
    """
    # Format de fichier : say supporte .aiff nativement, .wav via flag --file-format
    if fmt == "wav":
        suffix = ".wav"
        file_format_args = ["--file-format", "WAVE", "--data-format", "LEI16@22050"]
    else:
        suffix = ".aiff"
        file_format_args = []

    tmp_path: Optional[str] = None

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            tmp_path = f.name

        # Construction de la commande
        cmd = ["say", "-o", tmp_path] + file_format_args
        if voice:
            cmd += ["-v", voice]
        cmd.append(text)

        subprocess.run(cmd, check=True, timeout=30, capture_output=True)

        with open(tmp_path, "rb") as f:
            audio = f.read()

        return audio

    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


# ─── Informations sur le backend ──────────────────────────────────────────────


def get_tts_backend() -> str:
    """Retourne le nom du backend TTS actif."""
    if _PIPER_AVAILABLE:
        return "piper"
    if _MACOS_SAY_AVAILABLE:
        return "macos-say"
    return "unavailable"


def is_piper_available() -> bool:
    """True si piper-tts est installé et importable."""
    return _PIPER_AVAILABLE
