"""
tests/test_voice_service.py — Tests unitaires Voice Agent

Stratégie de mock :
  - stt_service.transcribe_audio  → mocké (évite de charger Whisper en CI)
  - tts_service.synthesize        → mocké (évite d'appeler 'say' ou piper)
  - microphone_service.record_audio → mocké (pas de hardware requis)
  - Tests d'intégration légers via FastAPI TestClient

On teste :
  1. /health — format stable Queen HealthMonitor
  2. /status — structure des capacités
  3. /transcribe — succès, base64 invalide, fallback sans Whisper
  4. /synthesize — succès, TTS indisponible
  5. /listen    — succès, micro indisponible
"""

from __future__ import annotations

import base64
import io
import wave
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from agents.voice.voice_agent import app

# ─── Fixtures ─────────────────────────────────────────────────────────────────


def _make_wav_bytes(duration_ms: int = 100, sample_rate: int = 16000) -> bytes:
    """Génère un fichier WAV silencieux minimal pour les tests."""
    num_samples = int(sample_rate * duration_ms / 1000)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


_SAMPLE_WAV = _make_wav_bytes()
_SAMPLE_WAV_B64 = base64.b64encode(_SAMPLE_WAV).decode()

# Réponse STT de succès prête à l'emploi
_STT_SUCCESS = {
    "text":                 "Bonjour Chimera",
    "language":             "fr",
    "language_probability": 0.99,
    "stt_backend":          "faster-whisper",
    "whisper_available":    True,
}

# Réponse STT dégradée (sans Whisper)
_STT_FALLBACK = {
    "text":                 "",
    "language":             None,
    "language_probability": 0.0,
    "stt_backend":          "fallback",
    "whisper_available":    False,
}

# Quelques bytes audio factices pour TTS
_FAKE_AUDIO = b"RIFF" + b"\x00" * 40


@pytest.fixture(autouse=True)
def prevent_real_model_load(monkeypatch):
    """
    Empêche le chargement réel du modèle Whisper en CI ou sans GPU.

    faster-whisper est installé localement, mais l'init du modèle
    (téléchargement + chargement ONNX) peut crasher dans un thread pytest.
    On patche _get_whisper_model pour lever ImportError si aucun mock STT
    n'a déjà été appliqué sur transcribe_audio.

    Ce fixture est autouse=True : il s'applique à TOUS les tests.
    Les tests qui ont besoin d'un STT réel doivent fournir mock_stt_success
    ou mock_stt_fallback (qui patchent transcribe_audio avant que ce guard
    ne soit jamais atteint).
    """
    monkeypatch.setattr(
        "agents.voice.services.stt_service._get_whisper_model",
        MagicMock(side_effect=RuntimeError("Modèle Whisper désactivé en tests")),
    )


@pytest.fixture
def client():
    """TestClient FastAPI sans démarrage de serveur réel."""
    return TestClient(app)


@pytest.fixture
def mock_stt_success(monkeypatch):
    """Mock STT → transcription réussie."""
    mock = AsyncMock(return_value=_STT_SUCCESS)
    monkeypatch.setattr("agents.voice.voice_agent.stt_service.transcribe_audio", mock)
    return mock


@pytest.fixture
def mock_stt_fallback(monkeypatch):
    """Mock STT → fallback sans Whisper."""
    mock = AsyncMock(return_value=_STT_FALLBACK)
    monkeypatch.setattr("agents.voice.voice_agent.stt_service.transcribe_audio", mock)
    return mock


@pytest.fixture
def mock_tts_success(monkeypatch):
    """Mock TTS → retourne des bytes audio factices."""
    mock = AsyncMock(return_value=_FAKE_AUDIO)
    monkeypatch.setattr("agents.voice.voice_agent.tts_service.synthesize", mock)
    return mock


@pytest.fixture
def mock_tts_unavailable(monkeypatch):
    """Mock TTS → RuntimeError (aucun backend)."""
    mock = AsyncMock(side_effect=RuntimeError("Aucun backend TTS disponible"))
    monkeypatch.setattr("agents.voice.voice_agent.tts_service.synthesize", mock)
    return mock


@pytest.fixture
def mock_microphone_success(monkeypatch):
    """Mock microphone → retourne des bytes WAV et durée."""
    mock = AsyncMock(return_value=(_SAMPLE_WAV, 5.0))
    monkeypatch.setattr("agents.voice.voice_agent.record_audio", mock)
    return mock


@pytest.fixture
def mock_microphone_unavailable(monkeypatch):
    """Mock microphone → RuntimeError (pas de hardware)."""
    mock = AsyncMock(side_effect=RuntimeError("Aucun backend microphone disponible"))
    monkeypatch.setattr("agents.voice.voice_agent.record_audio", mock)
    return mock


# ─── Tests /health ────────────────────────────────────────────────────────────


class TestHealth:
    def test_health_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_service_name(self, client):
        data = client.get("/health").json()
        assert data["service"] == "voice"

    def test_health_status_ok(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_health_has_timestamp(self, client):
        data = client.get("/health").json()
        assert "timestamp" in data

    def test_health_has_stt_backend(self, client):
        data = client.get("/health").json()
        assert "stt_backend" in data

    def test_health_has_tts_backend(self, client):
        data = client.get("/health").json()
        assert "tts_backend" in data

    def test_health_has_whisper_flag(self, client):
        data = client.get("/health").json()
        assert "whisper_available" in data


# ─── Tests /status ────────────────────────────────────────────────────────────


class TestStatus:
    def test_status_returns_200(self, client):
        resp = client.get("/status")
        assert resp.status_code == 200

    def test_status_structure(self, client):
        data = client.get("/status").json()
        required_fields = [
            "service", "whisper_available", "piper_available",
            "microphone_available", "tts_backend", "stt_backend",
            "supported_models",
        ]
        for field in required_fields:
            assert field in data, f"Champ manquant : {field}"

    def test_status_service_name(self, client):
        data = client.get("/status").json()
        assert data["service"] == "voice"

    def test_status_supported_models_is_list(self, client):
        data = client.get("/status").json()
        assert isinstance(data["supported_models"], list)

    def test_status_models_include_base(self, client):
        data = client.get("/status").json()
        assert "base" in data["supported_models"]


# ─── Tests /transcribe ────────────────────────────────────────────────────────


class TestTranscribe:
    def test_transcribe_success(self, client, mock_stt_success):
        resp = client.post("/transcribe", json={"audio_base64": _SAMPLE_WAV_B64})
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Bonjour Chimera"
        assert data["language"] == "fr"
        assert data["whisper_available"] is True
        assert data["stt_backend"] == "faster-whisper"

    def test_transcribe_has_duration_ms(self, client, mock_stt_success):
        data = client.post("/transcribe", json={"audio_base64": _SAMPLE_WAV_B64}).json()
        assert "duration_ms" in data
        assert data["duration_ms"] >= 0

    def test_transcribe_fallback_without_whisper(self, client, mock_stt_fallback):
        """Sans Whisper, l'endpoint doit retourner 200 avec text="" (pas 503)."""
        resp = client.post("/transcribe", json={"audio_base64": _SAMPLE_WAV_B64})
        assert resp.status_code == 200
        data = resp.json()
        assert data["whisper_available"] is False
        assert data["text"] == ""
        assert data["stt_backend"] == "fallback"

    def test_transcribe_invalid_base64_returns_400(self, client):
        resp = client.post("/transcribe", json={"audio_base64": "!!!invalide!!!"})
        assert resp.status_code == 400

    def test_transcribe_language_forwarded(self, client, mock_stt_success):
        """La langue doit être transmise au service STT."""
        client.post("/transcribe", json={
            "audio_base64": _SAMPLE_WAV_B64,
            "language": "en",
        })
        call_kwargs = mock_stt_success.call_args[1]
        assert call_kwargs["language"] == "en"

    def test_transcribe_model_forwarded(self, client, mock_stt_success):
        """Le modèle doit être transmis au service STT."""
        client.post("/transcribe", json={
            "audio_base64": _SAMPLE_WAV_B64,
            "model": "small",
        })
        call_kwargs = mock_stt_success.call_args[1]
        assert call_kwargs["model_name"] == "small"

    def test_transcribe_language_probability_present(self, client, mock_stt_success):
        data = client.post("/transcribe", json={"audio_base64": _SAMPLE_WAV_B64}).json()
        assert "language_probability" in data
        assert 0.0 <= data["language_probability"] <= 1.0


# ─── Tests /synthesize ────────────────────────────────────────────────────────


class TestSynthesize:
    def test_synthesize_success(self, client, mock_tts_success):
        resp = client.post("/synthesize", json={"text": "Bonjour le monde"})
        assert resp.status_code == 200
        data = resp.json()
        assert "audio_base64" in data
        assert data["text_length"] == len("Bonjour le monde")
        assert data["format"] == "aiff"

    def test_synthesize_audio_is_valid_base64(self, client, mock_tts_success):
        data = client.post("/synthesize", json={"text": "Test"}).json()
        decoded = base64.b64decode(data["audio_base64"])
        assert len(decoded) > 0

    def test_synthesize_503_when_tts_unavailable(self, client, mock_tts_unavailable):
        resp = client.post("/synthesize", json={"text": "Test"})
        assert resp.status_code == 503

    def test_synthesize_has_duration_ms(self, client, mock_tts_success):
        data = client.post("/synthesize", json={"text": "Test"}).json()
        assert "duration_ms" in data
        assert data["duration_ms"] >= 0

    def test_synthesize_wav_format(self, client, mock_tts_success):
        resp = client.post("/synthesize", json={"text": "Test", "format": "wav"})
        assert resp.status_code == 200
        assert resp.json()["format"] == "wav"

    def test_synthesize_voice_forwarded(self, client, mock_tts_success):
        """La voix doit être transmise au service TTS."""
        client.post("/synthesize", json={"text": "Test", "voice": "Amelie"})
        call_kwargs = mock_tts_success.call_args[1]
        assert call_kwargs["voice"] == "Amelie"


# ─── Tests /listen ────────────────────────────────────────────────────────────


class TestListen:
    def test_listen_success(self, client, mock_microphone_success, mock_stt_success):
        resp = client.post("/listen", json={"duration_seconds": 2.0})
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Bonjour Chimera"
        assert data["microphone_available"] is True
        assert data["audio_duration_seconds"] == 5.0

    def test_listen_503_when_microphone_unavailable(
        self, client, mock_microphone_unavailable
    ):
        resp = client.post("/listen", json={"duration_seconds": 2.0})
        assert resp.status_code == 503

    def test_listen_has_duration_ms(
        self, client, mock_microphone_success, mock_stt_success
    ):
        data = client.post("/listen", json={}).json()
        assert "duration_ms" in data
        assert data["duration_ms"] >= 0

    def test_listen_language_forwarded(
        self, client, mock_microphone_success, mock_stt_success
    ):
        """La langue doit être transmise au service STT."""
        client.post("/listen", json={"language": "fr"})
        call_kwargs = mock_stt_success.call_args[1]
        assert call_kwargs["language"] == "fr"
