"""
voice_agent.py — FastAPI app pour le Voice Agent (:8010)

Le Voice Agent est les oreilles et la voix de Chimera. Il :
  1. Transcrit de l'audio (base64) en texte via faster-whisper (STT)
  2. Synthétise du texte en audio via piper ou macOS say (TTS)
  3. Démarre une session d'écoute microphone et transcrit en temps réel

Endpoints :
  GET  /health      — liveness check (HealthMonitor Queen)
  GET  /status      — capacités détaillées (backends STT/TTS, micro dispo)
  POST /transcribe  — audio base64 → texte (faster-whisper)
  POST /synthesize  — texte → audio base64 (piper ou macOS say)
  POST /listen      — démarrage d'une session microphone → texte

Lancement :
  uvicorn agents.voice.voice_agent:app --port 8010 --reload

Architecture :
  - Dégradation gracieuse : chaque endpoint reste fonctionnel même sans les dépendances optionnelles
  - Pas d'état global : chaque requête est indépendante
  - Compatible Queen HealthMonitor (format /health standard Chimera)
"""

from __future__ import annotations

import base64
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException

from agents.voice.schemas.voice_schemas import (
    ListenRequest,
    ListenResponse,
    StatusResponse,
    SynthesizeRequest,
    SynthesizeResponse,
    TranscribeRequest,
    TranscribeResponse,
)
from agents.voice.services import stt_service, tts_service
from agents.voice.services.microphone_service import (
    is_microphone_available,
    record_audio,
)

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Voice Agent",
    description="Les oreilles et la voix de Chimera — STT, TTS et écoute microphone",
    version="1.0.0",
)


# ─── /health ──────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Liveness check — format stable pour Queen HealthMonitor."""
    return {
        "status":          "ok",
        "service":         "voice",
        "timestamp":       datetime.now(timezone.utc).isoformat(),
        "stt_backend":     stt_service.get_stt_backend(),
        "tts_backend":     tts_service.get_tts_backend(),
        "whisper_available": stt_service.is_whisper_available(),
    }


# ─── /status ──────────────────────────────────────────────────────────────────


@app.get("/status", response_model=StatusResponse)
async def status() -> StatusResponse:
    """Capacités détaillées de l'agent (backends actifs, micro, modèles disponibles)."""
    return StatusResponse(
        service=             "voice",
        whisper_available=   stt_service.is_whisper_available(),
        whisper_version=     stt_service.get_whisper_version(),
        piper_available=     tts_service.is_piper_available(),
        microphone_available= is_microphone_available(),
        tts_backend=         tts_service.get_tts_backend(),
        stt_backend=         stt_service.get_stt_backend(),
        supported_models=    stt_service.get_supported_models(),
    )


# ─── /transcribe ──────────────────────────────────────────────────────────────


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest) -> TranscribeResponse:
    """
    Transcrit un fichier audio encodé en base64 en texte.

    - audio_base64 : contenu audio brut encodé en base64 (WAV, MP3, OGG, FLAC…)
    - language     : code ISO 639-1 ('fr', 'en'…). None = détection automatique.
    - model        : modèle Whisper (tiny/base/small/medium/large-v2/large-v3)
    - beam_size    : qualité du beam search (5 = équilibre vitesse/précision)

    Sans faster-whisper : retourne text="" et whisper_available=False (pas de 503).
    L'agent ne crashe jamais — il dégrade gracieusement.

    Lève 400 si le base64 fourni est invalide.
    """
    t0 = time.monotonic()

    # Décodage base64 (validate=True rejette les caractères non-base64)
    try:
        audio_bytes = base64.b64decode(req.audio_base64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"audio_base64 invalide : {exc}")

    # Transcription STT
    result = await stt_service.transcribe_audio(
        audio_bytes=audio_bytes,
        language=req.language,
        model_name=req.model,
        beam_size=req.beam_size,
    )

    duration_ms = int((time.monotonic() - t0) * 1000)

    return TranscribeResponse(
        text=                 result["text"],
        language=             result["language"],
        language_probability= result["language_probability"],
        duration_ms=          duration_ms,
        stt_backend=          result["stt_backend"],
        whisper_available=    result["whisper_available"],
    )


# ─── /synthesize ──────────────────────────────────────────────────────────────


@app.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(req: SynthesizeRequest) -> SynthesizeResponse:
    """
    Synthétise du texte en audio et retourne le résultat encodé en base64.

    - text   : texte à synthétiser (max 4096 caractères)
    - voice  : nom de voix (ex: 'Amelie' pour macOS say). None = voix système.
    - format : format de sortie audio ('aiff' ou 'wav')

    Backend utilisé (par ordre de priorité) :
      1. piper-tts (si installé)
      2. macOS say (toujours disponible sur Mac)

    Lève 503 si aucun backend TTS n'est disponible.
    """
    t0 = time.monotonic()

    try:
        audio_bytes = await tts_service.synthesize(
            text=req.text,
            voice=req.voice,
            fmt=req.format,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    duration_ms = int((time.monotonic() - t0) * 1000)

    return SynthesizeResponse(
        audio_base64= base64.b64encode(audio_bytes).decode(),
        format=       req.format,
        text_length=  len(req.text),
        duration_ms=  duration_ms,
        tts_backend=  tts_service.get_tts_backend(),
    )


# ─── /listen ──────────────────────────────────────────────────────────────────


@app.post("/listen", response_model=ListenResponse)
async def listen(req: ListenRequest) -> ListenResponse:
    """
    Démarre une session d'écoute microphone et transcrit ce qui a été dit.

    - duration_seconds : durée max d'enregistrement (0.5 - 60 secondes)
    - language         : langue cible. None = détection automatique.
    - sample_rate      : fréquence Hz (16000 recommandé pour Whisper)

    Lève 503 si le microphone est inaccessible (pas de hardware, pas de permission).
    Si faster-whisper n'est pas disponible, retourne text="" avec whisper_available=False.
    """
    t0 = time.monotonic()

    # Enregistrement microphone
    try:
        audio_bytes, audio_duration = await record_audio(
            duration_seconds=req.duration_seconds,
            sample_rate=req.sample_rate,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Transcription du micro
    result = await stt_service.transcribe_audio(
        audio_bytes=audio_bytes,
        language=req.language,
    )

    duration_ms = int((time.monotonic() - t0) * 1000)

    return ListenResponse(
        text=                   result["text"],
        language=               result["language"],
        audio_duration_seconds= audio_duration,
        duration_ms=            duration_ms,
        microphone_available=   True,
        stt_backend=            result["stt_backend"],
    )


# ─── Lancement direct ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "agents.voice.voice_agent:app",
        host="0.0.0.0",
        port=8010,
        reload=True,
    )
