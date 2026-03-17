"""
voice_agent.py — Pipeline voix La Ruche (:8011)

Flux complet :
  Micro → Whisper (STT local) → Texte → Queen (/inbound) → Réponse → TTS (macOS say)

Endpoints :
  GET  /health
  POST /listen    — enregistre 5s depuis le micro et transcrit
  POST /transcribe — transcrit un fichier audio (WAV/MP3) uploadé
  POST /speak     — TTS: lit le texte à voix haute (macOS say)
  POST /voice-command — listen + transcribe + send to Queen + speak response
"""
from __future__ import annotations
import asyncio, os, subprocess, tempfile, uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
import httpx

app = FastAPI(title="Voice Agent", version="1.0.0")
QUEEN_URL = os.environ.get("QUEEN_URL", "http://localhost:3000")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# ─── Modèles Pydantic ─────────────────────────────────────────────────────────

class SpeakRequest(BaseModel):
    text: str
    voice: str = "Amelie"   # voix macOS française
    speed: int = 180

class ListenRequest(BaseModel):
    duration_seconds: int = 5
    language: str = "fr"

# ─── Utilitaires ──────────────────────────────────────────────────────────────

async def transcribe_audio(audio_path: str, language: str = "fr") -> str:
    """Transcrit un fichier audio avec Whisper (via ollama ou mlx-whisper)."""
    # Essai 1: mlx-whisper (optimisé Apple Silicon M2)
    try:
        result = subprocess.run(
            ["mlx_whisper", audio_path, "--model", "mlx-community/whisper-large-v3-turbo", "--language", language],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Essai 2: whisper CLI classique
    try:
        result = subprocess.run(
            ["whisper", audio_path, "--language", language, "--model", "base", "--output_format", "txt"],
            capture_output=True, text=True, timeout=60, cwd=tempfile.gettempdir()
        )
        txt_path = Path(audio_path).with_suffix(".txt")
        if txt_path.exists():
            text = txt_path.read_text().strip()
            txt_path.unlink(missing_ok=True)
            return text
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Essai 3: faster-whisper Python
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel("base", device="auto", compute_type="int8")
        segments, _ = model.transcribe(audio_path, language=language)
        return " ".join(s.text for s in segments).strip()
    except ImportError:
        pass

    raise HTTPException(status_code=503, detail="Whisper non disponible. Installe mlx-whisper: pip install mlx-whisper")

async def record_audio(duration: int = 5) -> str:
    """Enregistre depuis le micro (macOS sox ou afrecord)."""
    path = f"/tmp/ruche_voice_{uuid.uuid4().hex}.wav"

    # Essai 1: sox (brew install sox)
    try:
        proc = await asyncio.create_subprocess_exec(
            "sox", "-d", "-r", "16000", "-c", "1", path, "trim", "0", str(duration),
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        await asyncio.wait_for(proc.wait(), timeout=duration + 5)
        return path
    except (FileNotFoundError, asyncio.TimeoutError):
        pass

    # Essai 2: afrecord (macOS natif)
    try:
        proc = await asyncio.create_subprocess_exec(
            "afrecord", "-f", "WAVE", "-d", str(duration), path,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        await asyncio.wait_for(proc.wait(), timeout=duration + 5)
        return path
    except (FileNotFoundError, asyncio.TimeoutError):
        pass

    raise HTTPException(status_code=503, detail="Enregistrement audio non disponible. Installe sox: brew install sox")

async def speak(text: str, voice: str = "Amelie", speed: int = 180):
    """TTS via macOS say."""
    proc = await asyncio.create_subprocess_exec(
        "say", "-v", voice, "-r", str(speed), text,
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await proc.wait()

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "agent": "voice", "port": 8011}

@app.post("/speak")
async def speak_endpoint(req: SpeakRequest):
    await speak(req.text, req.voice, req.speed)
    return {"spoken": req.text}

@app.post("/transcribe")
async def transcribe_endpoint(file: UploadFile = File(...), language: str = "fr"):
    path = f"/tmp/ruche_upload_{uuid.uuid4().hex}.wav"
    content = await file.read()
    Path(path).write_bytes(content)
    try:
        text = await transcribe_audio(path, language)
        return {"text": text, "language": language}
    finally:
        Path(path).unlink(missing_ok=True)

@app.post("/listen")
async def listen_endpoint(req: ListenRequest):
    """Enregistre depuis le micro et transcrit."""
    audio_path = await record_audio(req.duration_seconds)
    try:
        text = await transcribe_audio(audio_path, req.language)
        return {"text": text, "duration": req.duration_seconds}
    finally:
        Path(audio_path).unlink(missing_ok=True)

@app.post("/voice-command")
async def voice_command(req: ListenRequest):
    """Pipeline complet: écoute → transcrit → envoie à Queen → lit la réponse."""
    # 1. Écoute
    audio_path = await record_audio(req.duration_seconds)

    try:
        # 2. Transcription
        user_text = await transcribe_audio(audio_path, req.language)
        if not user_text:
            return {"error": "Rien compris"}

        # 3. Envoyer à Queen
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{QUEEN_URL}/api/chat",
                json={"message": user_text, "source": "voice"},
            )
            response_data = resp.json()
            response_text = response_data.get("response") or response_data.get("message") or "Je n'ai pas de réponse."

        # 4. TTS: lire la réponse
        await speak(response_text)

        return {
            "heard": user_text,
            "response": response_text
        }
    finally:
        Path(audio_path).unlink(missing_ok=True)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8011)
