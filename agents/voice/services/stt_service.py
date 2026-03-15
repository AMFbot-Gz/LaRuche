"""
services/stt_service.py — Speech-to-Text (STT)

Stratégie de backends (en ordre de priorité) :
  1. faster-whisper — modèle Whisper quantisé, rapide, local, multilingue
     → pip install faster-whisper
  2. Fallback — retourne un placeholder (utile en CI ou sans GPU/modèle)

Architecture inspirée de AMFbot-Suite/src/voice/stt_engine.py :
  - Chargement lazy du modèle (première utilisation)
  - Support de la transcription depuis un fichier audio temporaire
  - Dégradation gracieuse si la dépendance est absente

Utilisation :
    result = await transcribe_audio(audio_bytes, language="fr", model="base")
    text = result["text"]
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import tempfile
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Disponibilité faster-whisper ─────────────────────────────────────────────

try:
    from faster_whisper import WhisperModel
    _WHISPER_AVAILABLE = True
    try:
        import faster_whisper
        _WHISPER_VERSION = getattr(faster_whisper, "__version__", "inconnu")
    except Exception:
        _WHISPER_VERSION = "inconnu"
    logger.info("faster-whisper disponible (version %s)", _WHISPER_VERSION)
except ImportError:
    _WHISPER_AVAILABLE = False
    _WHISPER_VERSION = None
    logger.warning(
        "faster-whisper non disponible — STT dégradé. "
        "Installez via : pip install faster-whisper"
    )

# ─── Cache modèle (singleton par nom de modèle) ───────────────────────────────

_model_cache: dict[str, "WhisperModel"] = {}


def _get_whisper_model(model_name: str = "base") -> "WhisperModel":
    """
    Retourne le modèle Whisper demandé depuis le cache ou le charge.

    Le chargement se fait en CPU avec quantisation int8 pour économiser la mémoire.
    Sur Apple Silicon, device="cpu" + compute_type="int8" fonctionne bien.
    """
    if model_name not in _model_cache:
        logger.info("Chargement du modèle Whisper '%s'…", model_name)
        _model_cache[model_name] = WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8",
        )
        logger.info("Modèle '%s' chargé.", model_name)
    return _model_cache[model_name]


# ─── Transcription principale ─────────────────────────────────────────────────


async def transcribe_audio(
    audio_bytes: bytes,
    language: Optional[str] = None,
    model_name: str = "base",
    beam_size: int = 5,
) -> dict:
    """
    Transcrit un fichier audio (bytes) en texte.

    Args:
        audio_bytes  : contenu du fichier audio brut (WAV, MP3, OGG, FLAC…)
        language     : code ISO 639-1 ('fr', 'en'…) ou None pour la détection auto
        model_name   : modèle Whisper à utiliser (tiny/base/small/medium/large-v2…)
        beam_size    : taille du beam search (5 = bon équilibre vitesse/précision)

    Returns:
        {
            "text":                 str,
            "language":             str | None,
            "language_probability": float,
            "stt_backend":          str,
            "whisper_available":    bool,
        }
    """
    if not _WHISPER_AVAILABLE:
        return _fallback_response()

    # Transcription bloquante → exécutée dans un thread pour ne pas bloquer la boucle asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        _transcribe_sync,
        audio_bytes,
        language,
        model_name,
        beam_size,
    )
    return result


def _transcribe_sync(
    audio_bytes: bytes,
    language: Optional[str],
    model_name: str,
    beam_size: int,
) -> dict:
    """
    Transcription synchrone via faster-whisper.

    Écrit l'audio dans un fichier temporaire (faster-whisper accepte des chemins,
    pas des bytes en mémoire), transcrit, puis supprime le fichier temporaire.
    """
    # Écriture dans un fichier temp
    suffix = _detect_audio_suffix(audio_bytes)
    tmp_path: Optional[str] = None

    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        model = _get_whisper_model(model_name)

        # VAD filtering intégré : silero-vad réduit les hallucinations sur le silence
        segments, info = model.transcribe(
            tmp_path,
            beam_size=beam_size,
            language=language,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )

        text = " ".join(seg.text.strip() for seg in segments).strip()

        return {
            "text":                 text,
            "language":             info.language,
            "language_probability": round(info.language_probability, 4),
            "stt_backend":          "faster-whisper",
            "whisper_available":    True,
        }

    except Exception as exc:
        logger.error("Erreur transcription faster-whisper : %s", exc)
        return {
            "text":                 "",
            "language":             language,
            "language_probability": 0.0,
            "stt_backend":          "faster-whisper",
            "whisper_available":    True,
        }

    finally:
        # Nettoyage du fichier temporaire dans tous les cas
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def _detect_audio_suffix(audio_bytes: bytes) -> str:
    """
    Devine l'extension du fichier audio depuis les magic bytes.
    Fallback sur .wav si inconnu.
    """
    if audio_bytes[:4] == b"RIFF":
        return ".wav"
    if audio_bytes[:3] == b"ID3" or audio_bytes[:2] == b"\xff\xfb":
        return ".mp3"
    if audio_bytes[:4] == b"OggS":
        return ".ogg"
    if audio_bytes[:4] == b"fLaC":
        return ".flac"
    return ".wav"  # fallback


# ─── Fallback (sans faster-whisper) ───────────────────────────────────────────


def _fallback_response() -> dict:
    """
    Réponse dégradée quand faster-whisper n'est pas disponible.

    Retourne un placeholder explicite pour signaler l'absence du backend STT.
    La transcription réelle nécessite : pip install faster-whisper
    """
    logger.debug("STT fallback activé — faster-whisper non disponible")
    return {
        "text":                 "",
        "language":             None,
        "language_probability": 0.0,
        "stt_backend":          "fallback",
        "whisper_available":    False,
    }


# ─── Informations sur le backend ──────────────────────────────────────────────


def get_stt_backend() -> str:
    """Retourne le nom du backend STT actif."""
    return "faster-whisper" if _WHISPER_AVAILABLE else "fallback"


def get_whisper_version() -> Optional[str]:
    """Retourne la version de faster-whisper si disponible."""
    return _WHISPER_VERSION if _WHISPER_AVAILABLE else None


def is_whisper_available() -> bool:
    """True si faster-whisper est installé et importable."""
    return _WHISPER_AVAILABLE


def get_supported_models() -> list[str]:
    """
    Retourne la liste des noms de modèles Whisper supportés.
    Ces modèles sont téléchargés automatiquement à la première utilisation.
    """
    return ["tiny", "base", "small", "medium", "large-v2", "large-v3"]
