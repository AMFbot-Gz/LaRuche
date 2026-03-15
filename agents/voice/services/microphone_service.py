"""
services/microphone_service.py — Enregistrement microphone

Stratégie de backends :
  1. sounddevice — enregistrement propre, Numpy, cross-platform
     → pip install sounddevice
  2. pyaudio — alternative si sounddevice absent
     → pip install pyaudio

Sans l'un ou l'autre, l'endpoint /listen retourne 503.
Les endpoints /transcribe et /synthesize ne dépendent pas de ce module.

Utilisation :
    audio_bytes, duration = await record_audio(duration_seconds=5.0)
"""

from __future__ import annotations

import asyncio
import io
import logging
import struct
import wave
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Disponibilité des backends microphone ────────────────────────────────────

try:
    import sounddevice as sd
    import numpy as np
    _SOUNDDEVICE_AVAILABLE = True
    logger.info("sounddevice disponible pour l'enregistrement microphone")
except ImportError:
    _SOUNDDEVICE_AVAILABLE = False
    logger.warning(
        "sounddevice non disponible. "
        "Installez via : pip install sounddevice"
    )

try:
    import pyaudio  # type: ignore
    _PYAUDIO_AVAILABLE = True
    logger.info("pyaudio disponible pour l'enregistrement microphone")
except ImportError:
    _PYAUDIO_AVAILABLE = False


# ─── Enregistrement principal ─────────────────────────────────────────────────


async def record_audio(
    duration_seconds: float = 5.0,
    sample_rate: int = 16000,
) -> tuple[bytes, float]:
    """
    Enregistre l'audio depuis le microphone par défaut.

    L'enregistrement bloquant est exécuté dans un thread pour ne pas bloquer asyncio.

    Args:
        duration_seconds : durée d'enregistrement en secondes
        sample_rate      : fréquence d'échantillonnage Hz (16000 recommandé pour Whisper)

    Returns:
        (audio_bytes, actual_duration) :
            - audio_bytes    : contenu WAV PCM 16 bits mono
            - actual_duration: durée réelle enregistrée en secondes

    Raises:
        RuntimeError : si aucun backend microphone n'est disponible
    """
    loop = asyncio.get_event_loop()

    if _SOUNDDEVICE_AVAILABLE:
        return await loop.run_in_executor(
            None,
            _record_sounddevice,
            duration_seconds,
            sample_rate,
        )

    if _PYAUDIO_AVAILABLE:
        return await loop.run_in_executor(
            None,
            _record_pyaudio,
            duration_seconds,
            sample_rate,
        )

    raise RuntimeError(
        "Aucun backend microphone disponible. "
        "Installez sounddevice : pip install sounddevice "
        "ou pyaudio : pip install pyaudio"
    )


# ─── Backend sounddevice ──────────────────────────────────────────────────────


def _record_sounddevice(duration_seconds: float, sample_rate: int) -> tuple[bytes, float]:
    """
    Enregistrement via sounddevice (recommandé).

    sounddevice utilise PortAudio sous le capot et expose une API Numpy propre.
    L'audio est enregistré en float32 mono puis converti en PCM int16 pour le WAV.
    """
    try:
        # Enregistrement bloquant : retourne un tableau Numpy float32 (samples, channels)
        recording = sd.rec(
            int(duration_seconds * sample_rate),
            samplerate=sample_rate,
            channels=1,
            dtype="float32",
        )
        sd.wait()  # Bloquant jusqu'à la fin de l'enregistrement

        # Conversion float32 → int16 (requis par WAV PCM standard)
        recording_int16 = (recording * 32767).astype(np.int16)

        return _numpy_to_wav(recording_int16, sample_rate), duration_seconds

    except sd.PortAudioError as exc:
        raise RuntimeError(f"Erreur microphone sounddevice : {exc}")


def _numpy_to_wav(samples: "np.ndarray", sample_rate: int) -> bytes:
    """Convertit un tableau Numpy int16 mono en bytes WAV."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)       # Mono
        wf.setsampwidth(2)       # 2 bytes = int16
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


# ─── Backend pyaudio ──────────────────────────────────────────────────────────


def _record_pyaudio(duration_seconds: float, sample_rate: int) -> tuple[bytes, float]:
    """
    Enregistrement via pyaudio (fallback si sounddevice absent).

    Utilise le chunk-based recording de pyaudio.
    """
    CHUNK = 1024
    FORMAT = pyaudio.paInt16
    CHANNELS = 1

    try:
        pa = pyaudio.PyAudio()
        stream = pa.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=sample_rate,
            input=True,
            frames_per_buffer=CHUNK,
        )

        frames = []
        num_chunks = int(sample_rate / CHUNK * duration_seconds)

        for _ in range(num_chunks):
            data = stream.read(CHUNK, exception_on_overflow=False)
            frames.append(data)

        stream.stop_stream()
        stream.close()
        pa.terminate()

        # Assemblage en WAV
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(pa.get_sample_size(FORMAT))
            wf.setframerate(sample_rate)
            wf.writeframes(b"".join(frames))

        return buf.getvalue(), duration_seconds

    except OSError as exc:
        raise RuntimeError(f"Erreur microphone pyaudio : {exc}")


# ─── Informations backend ─────────────────────────────────────────────────────


def is_microphone_available() -> bool:
    """True si au moins un backend microphone est disponible."""
    return _SOUNDDEVICE_AVAILABLE or _PYAUDIO_AVAILABLE
