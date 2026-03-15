"""
tests/test_perception_service.py — Tests unitaires Perception Agent

Stratégie de mock :
  - screenshot_service.capture_screenshot → mocké (évite d'ouvrir l'écran en CI)
  - ocr_service.extract_text             → mocké selon les scénarios
  - Tests d'intégration légers via FastAPI TestClient

On teste :
  1. Les endpoints HTTP (status codes, structure réponse)
  2. Le comportement avec OCR disponible
  3. La dégradation gracieuse sans Tesseract
  4. La recherche de texte
  5. L'analyse visuelle
"""

from __future__ import annotations

import base64
import io
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from agents.perception.perception_agent import app

# ─── Fixtures ─────────────────────────────────────────────────────────────────

# Image PNG 1x1 pixel rouge — suffisante pour tester sans vraie capture écran
_PIXEL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)
_PIXEL_B64 = base64.b64encode(_PIXEL_PNG).decode()


@pytest.fixture
def client():
    """TestClient FastAPI sans démarrage de serveur réel."""
    return TestClient(app)


@pytest.fixture
def mock_screenshot(monkeypatch):
    """Mock capture_screenshot → retourne une image 1x1 pixel."""
    mock = MagicMock(return_value=(_PIXEL_PNG, 1920, 1080))
    monkeypatch.setattr(
        "agents.perception.perception_agent.screenshot_service.capture_screenshot",
        mock,
    )
    return mock


@pytest.fixture
def mock_ocr_available(monkeypatch):
    """Mock OCR disponible avec résultats prédéfinis."""
    monkeypatch.setattr(
        "agents.perception.perception_agent.ocr_service.extract_text",
        MagicMock(return_value={
            "text":          "Hello World Test",
            "lines":         ["Hello World Test"],
            "words":         [],
            "word_count":    3,
            "confidence":    92.5,
            "ocr_available": True,
        }),
    )


@pytest.fixture
def mock_ocr_unavailable(monkeypatch):
    """Mock OCR indisponible (Tesseract non installé)."""
    monkeypatch.setattr(
        "agents.perception.perception_agent.ocr_service.extract_text",
        MagicMock(return_value={
            "text":          "",
            "lines":         [],
            "words":         [],
            "word_count":    0,
            "confidence":    0.0,
            "ocr_available": False,
        }),
    )


# ─── Tests /health ────────────────────────────────────────────────────────────


class TestHealth:
    def test_health_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_service_name(self, client):
        data = client.get("/health").json()
        assert data["service"] == "perception"

    def test_health_status_ok(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_health_has_timestamp(self, client):
        data = client.get("/health").json()
        assert "timestamp" in data

    def test_health_has_ocr_flag(self, client):
        data = client.get("/health").json()
        assert "ocr_available" in data

    def test_health_has_screenshot_backend(self, client):
        data = client.get("/health").json()
        assert "screenshot_backend" in data


# ─── Tests /status ────────────────────────────────────────────────────────────


class TestStatus:
    def test_status_returns_200(self, client):
        resp = client.get("/status")
        assert resp.status_code == 200

    def test_status_structure(self, client):
        data = client.get("/status").json()
        assert "service" in data
        assert "ocr_available" in data
        assert "screen_count" in data
        assert "screens" in data
        assert "screenshot_backend" in data
        assert "supported_languages" in data

    def test_status_service_name(self, client):
        data = client.get("/status").json()
        assert data["service"] == "perception"

    def test_status_screens_is_list(self, client):
        data = client.get("/status").json()
        assert isinstance(data["screens"], list)


# ─── Tests /screenshot ────────────────────────────────────────────────────────


class TestScreenshot:
    def test_screenshot_success(self, client, mock_screenshot):
        resp = client.post("/screenshot", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert "image_base64" in data
        assert data["format"] == "png"
        assert data["width"] == 1920
        assert data["height"] == 1080
        assert data["duration_ms"] >= 0

    def test_screenshot_with_region(self, client, mock_screenshot):
        resp = client.post("/screenshot", json={
            "region": {"x": 100, "y": 100, "width": 500, "height": 300}
        })
        assert resp.status_code == 200
        # Vérifier que capture a été appelée avec la région
        call_kwargs = mock_screenshot.call_args[1]
        assert call_kwargs["region"]["x"] == 100
        assert call_kwargs["region"]["width"] == 500

    def test_screenshot_jpeg_format(self, client, mock_screenshot):
        resp = client.post("/screenshot", json={"format": "jpeg"})
        assert resp.status_code == 200
        assert resp.json()["format"] == "jpeg"

    def test_screenshot_503_on_backend_error(self, client, monkeypatch):
        monkeypatch.setattr(
            "agents.perception.perception_agent.screenshot_service.capture_screenshot",
            MagicMock(side_effect=RuntimeError("Aucun backend disponible")),
        )
        resp = client.post("/screenshot", json={})
        assert resp.status_code == 503

    def test_screenshot_base64_is_valid(self, client, mock_screenshot):
        data = client.post("/screenshot", json={}).json()
        # Ne doit pas lever d'exception au décodage base64
        decoded = base64.b64decode(data["image_base64"])
        assert len(decoded) > 0

    def test_screenshot_scale_default_1(self, client, mock_screenshot):
        resp = client.post("/screenshot", json={})
        assert resp.status_code == 200
        call_kwargs = mock_screenshot.call_args[1]
        assert call_kwargs["scale"] == 1.0


# ─── Tests /ocr ───────────────────────────────────────────────────────────────


class TestOcr:
    def test_ocr_success_with_tesseract(self, client, mock_screenshot, mock_ocr_available):
        resp = client.post("/ocr", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Hello World Test"
        assert data["word_count"] == 3
        assert data["ocr_available"] is True
        assert data["confidence"] == 92.5

    def test_ocr_graceful_without_tesseract(self, client, mock_screenshot, mock_ocr_unavailable):
        resp = client.post("/ocr", json={})
        # Ne doit PAS retourner 503 — dégradation gracieuse
        assert resp.status_code == 200
        data = resp.json()
        assert data["ocr_available"] is False
        assert data["text"] == ""
        assert data["word_count"] == 0

    def test_ocr_503_if_screenshot_fails(self, client, monkeypatch, mock_ocr_available):
        monkeypatch.setattr(
            "agents.perception.perception_agent.screenshot_service.capture_screenshot",
            MagicMock(side_effect=RuntimeError("No screen")),
        )
        resp = client.post("/ocr", json={})
        assert resp.status_code == 503

    def test_ocr_lang_forwarded(self, client, mock_screenshot, monkeypatch):
        extract_mock = MagicMock(return_value={
            "text": "", "lines": [], "words": [],
            "word_count": 0, "confidence": 0.0, "ocr_available": True
        })
        monkeypatch.setattr(
            "agents.perception.perception_agent.ocr_service.extract_text",
            extract_mock,
        )
        client.post("/ocr", json={"lang": "fra"})
        call_kwargs = extract_mock.call_args[1]
        assert call_kwargs["lang"] == "fra"

    def test_ocr_has_duration_ms(self, client, mock_screenshot, mock_ocr_available):
        data = client.post("/ocr", json={}).json()
        assert "duration_ms" in data
        assert data["duration_ms"] >= 0


# ─── Tests /screen_text ───────────────────────────────────────────────────────


class TestScreenText:
    def test_screen_text_returns_text(self, client, mock_screenshot, mock_ocr_available):
        resp = client.post("/screen_text")
        assert resp.status_code == 200
        data = resp.json()
        assert "text" in data
        assert "word_count" in data
        assert "duration_ms" in data

    def test_screen_text_unavailable_ocr(self, client, mock_screenshot, mock_ocr_unavailable):
        resp = client.post("/screen_text")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ocr_available"] is False


# ─── Tests /find_text ─────────────────────────────────────────────────────────


class TestFindText:
    def _mock_structured_ocr(self, monkeypatch, words_data):
        """Helper : mock OCR structuré avec une liste de mots."""
        monkeypatch.setattr(
            "agents.perception.perception_agent.ocr_service.extract_text",
            MagicMock(return_value={
                "text":          " ".join(w["text"] for w in words_data),
                "lines":         [],
                "words":         words_data,
                "word_count":    len(words_data),
                "confidence":    85.0,
                "ocr_available": True,
            }),
        )

    def test_find_text_found(self, client, mock_screenshot, monkeypatch):
        self._mock_structured_ocr(monkeypatch, [
            {"text": "Hello", "confidence": 90.0, "x": 10, "y": 20, "width": 50, "height": 20},
            {"text": "World", "confidence": 88.0, "x": 70, "y": 20, "width": 50, "height": 20},
        ])
        resp = client.post("/find_text", json={"text": "Hello"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["found"] is True
        assert len(data["matches"]) == 1
        assert data["matches"][0]["text"] == "Hello"

    def test_find_text_not_found(self, client, mock_screenshot, monkeypatch):
        self._mock_structured_ocr(monkeypatch, [
            {"text": "Hello", "confidence": 90.0, "x": 10, "y": 20, "width": 50, "height": 20},
        ])
        resp = client.post("/find_text", json={"text": "Python"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["found"] is False
        assert data["matches"] == []

    def test_find_text_case_insensitive(self, client, mock_screenshot, monkeypatch):
        self._mock_structured_ocr(monkeypatch, [
            {"text": "HELLO", "confidence": 90.0, "x": 0, "y": 0, "width": 50, "height": 20},
        ])
        resp = client.post("/find_text", json={"text": "hello", "case_sensitive": False})
        assert resp.status_code == 200
        assert resp.json()["found"] is True

    def test_find_text_case_sensitive(self, client, mock_screenshot, monkeypatch):
        self._mock_structured_ocr(monkeypatch, [
            {"text": "HELLO", "confidence": 90.0, "x": 0, "y": 0, "width": 50, "height": 20},
        ])
        resp = client.post("/find_text", json={"text": "hello", "case_sensitive": True})
        assert resp.status_code == 200
        assert resp.json()["found"] is False

    def test_find_text_query_preserved(self, client, mock_screenshot, monkeypatch):
        self._mock_structured_ocr(monkeypatch, [])
        resp = client.post("/find_text", json={"text": "my query"})
        assert resp.json()["query"] == "my query"


# ─── Tests /analyze ───────────────────────────────────────────────────────────


class TestAnalyze:
    def test_analyze_returns_200(self, client, mock_screenshot, monkeypatch):
        monkeypatch.setattr(
            "agents.perception.perception_agent.ocr_service.analyze_image_visual",
            MagicMock(return_value={
                "width": 1920, "height": 1080,
                "brightness": 128.0,
                "dominant_colors": ["#ffffff", "#000000", "#ff0000"],
            }),
        )
        monkeypatch.setattr(
            "agents.perception.perception_agent.ocr_service.extract_text",
            MagicMock(return_value={
                "text": "Some text", "lines": [], "words": [],
                "word_count": 2, "confidence": 80.0, "ocr_available": True,
            }),
        )
        resp = client.post("/analyze", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["width"] == 1920
        assert data["height"] == 1080
        assert data["has_text"] is True
        assert len(data["dominant_colors"]) == 3
        assert data["duration_ms"] >= 0

    def test_analyze_without_ocr(self, client, mock_screenshot, monkeypatch):
        monkeypatch.setattr(
            "agents.perception.perception_agent.ocr_service.analyze_image_visual",
            MagicMock(return_value={
                "width": 800, "height": 600,
                "brightness": 200.0,
                "dominant_colors": [],
            }),
        )
        resp = client.post("/analyze", json={"include_ocr": False})
        assert resp.status_code == 200
        data = resp.json()
        # Sans OCR, word_count = 0 et has_text = False
        assert data["has_text"] is False
        assert data["text_word_count"] == 0
