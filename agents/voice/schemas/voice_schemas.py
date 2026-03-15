"""
schemas/voice_schemas.py — Pydantic models pour l'API Voice Agent.

Tous les endpoints entrée/sortie sont typés ici.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ─── /transcribe ──────────────────────────────────────────────────────────────


class TranscribeRequest(BaseModel):
    """Requête de transcription : audio base64 → texte."""

    audio_base64: str = Field(
        ...,
        description="Fichier audio encodé en base64 (WAV, MP3, OGG, FLAC…)",
    )
    language: Optional[str] = Field(
        default=None,
        description="Code langue ISO 639-1 (ex: 'fr', 'en'). None = détection auto.",
    )
    model: str = Field(
        default="base",
        description="Modèle Whisper : tiny | base | small | medium | large-v2 | large-v3",
        pattern="^(tiny|base|small|medium|large-v2|large-v3)$",
    )
    beam_size: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Taille du beam search (plus élevé = plus précis mais plus lent)",
    )


class TranscribeResponse(BaseModel):
    """Réponse de transcription."""

    text: str = Field(description="Texte transcrit depuis l'audio")
    language: Optional[str] = Field(description="Langue détectée (code ISO 639-1)")
    language_probability: float = Field(
        description="Probabilité de la langue détectée (0.0-1.0)",
    )
    duration_ms: int = Field(description="Durée de traitement en millisecondes")
    stt_backend: str = Field(
        description="Backend STT utilisé : faster-whisper | fallback",
    )
    whisper_available: bool = Field(
        description="True si faster-whisper est installé et fonctionnel",
    )


# ─── /synthesize ──────────────────────────────────────────────────────────────


class SynthesizeRequest(BaseModel):
    """Requête de synthèse vocale : texte → audio base64."""

    text: str = Field(
        ...,
        min_length=1,
        max_length=4096,
        description="Texte à synthétiser en audio",
    )
    voice: Optional[str] = Field(
        default=None,
        description="Voix à utiliser (ex: 'Amelie' pour macOS say, nom de voix piper)",
    )
    format: str = Field(
        default="aiff",
        description="Format audio de sortie : aiff | wav",
        pattern="^(aiff|wav)$",
    )


class SynthesizeResponse(BaseModel):
    """Réponse de synthèse vocale."""

    audio_base64: str = Field(description="Audio encodé en base64")
    format: str = Field(description="Format audio : aiff | wav")
    text_length: int = Field(description="Nombre de caractères synthétisés")
    duration_ms: int = Field(description="Durée de traitement en millisecondes")
    tts_backend: str = Field(
        description="Backend TTS utilisé : piper | macos-say",
    )


# ─── /listen ──────────────────────────────────────────────────────────────────


class ListenRequest(BaseModel):
    """Requête de démarrage d'une session d'écoute microphone."""

    duration_seconds: float = Field(
        default=5.0,
        ge=0.5,
        le=60.0,
        description="Durée maximale d'enregistrement en secondes",
    )
    language: Optional[str] = Field(
        default=None,
        description="Langue cible pour la transcription. None = détection auto.",
    )
    sample_rate: int = Field(
        default=16000,
        description="Fréquence d'échantillonnage en Hz (16000 recommandé pour Whisper)",
    )


class ListenResponse(BaseModel):
    """Réponse d'une session d'écoute microphone."""

    text: str = Field(description="Texte transcrit depuis le microphone")
    language: Optional[str] = Field(description="Langue détectée")
    audio_duration_seconds: float = Field(description="Durée de l'audio enregistré")
    duration_ms: int = Field(description="Durée totale de traitement en ms")
    microphone_available: bool = Field(
        description="True si un microphone a pu être accédé",
    )
    stt_backend: str = Field(description="Backend STT utilisé pour la transcription")


# ─── /status ──────────────────────────────────────────────────────────────────


class StatusResponse(BaseModel):
    """État détaillé des capacités de l'agent Voice."""

    service: str
    whisper_available: bool = Field(description="True si faster-whisper est installé")
    whisper_version: Optional[str] = Field(description="Version de faster-whisper")
    piper_available: bool = Field(description="True si piper-tts est installé")
    microphone_available: bool = Field(
        description="True si sounddevice/pyaudio peut accéder au micro",
    )
    tts_backend: str = Field(description="Backend TTS actif : piper | macos-say")
    stt_backend: str = Field(description="Backend STT actif : faster-whisper | fallback")
    supported_models: list[str] = Field(
        default_factory=list,
        description="Modèles Whisper disponibles en local",
    )
