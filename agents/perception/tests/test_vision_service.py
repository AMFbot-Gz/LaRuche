"""
tests/test_vision_service.py — Tests unitaires Claude Vision Service

Stratégie de mock :
  - anthropic.Anthropic → mocké pour éviter tout appel réseau en CI
  - Tests de l'endpoint HTTP /vision_understand via FastAPI TestClient
  - Tests unitaires de understand_screen (parsing JSON, gestion d'erreurs)

On teste :
  1. Parsing correct d'une réponse Claude bien formée
  2. Nettoyage des blocs markdown dans la réponse
  3. Gestion d'erreur si JSON invalide
  4. Gestion d'erreur si ANTHROPIC_API_KEY absente
  5. Endpoint /vision_understand → 200 avec analyse correcte
  6. Endpoint /vision_understand → 400 si clé API manquante
  7. Endpoint /vision_understand → 502 si réponse Claude invalide
  8. Passage de l'historique (5 dernières actions max)
"""

from __future__ import annotations

import base64
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from agents.perception.perception_agent import app
from agents.perception.services.vision_service import (
    ClickableElement,
    NextAction,
    VisionAnalysis,
    understand_screen,
)

# ─── Fixtures & helpers ───────────────────────────────────────────────────────

# Image PNG 1x1 pixel — suffisante pour les tests sans vraie capture
_PIXEL_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)
_PIXEL_B64 = base64.b64encode(_PIXEL_PNG).decode()

# Réponse JSON type que Claude renverrait
_VALID_VISION_JSON = {
    "ui_state": "Bureau macOS, aucune fenêtre ouverte",
    "clickable_elements": [
        {"label": "Safari", "x": 0.1, "y": 0.95, "confidence": 0.95},
        {"label": "Finder", "x": 0.05, "y": 0.95, "confidence": 0.90},
    ],
    "next_action": {
        "type": "click",
        "target": "icône Safari dans le Dock",
        "value": None,
        "x": 0.1,
        "y": 0.95,
    },
    "goal_progress": 10,
    "goal_achieved": False,
    "reasoning": "Safari n'est pas encore ouvert, il faut cliquer sur son icône dans le Dock",
}

# Réponse correspondant à un goal atteint
_DONE_VISION_JSON = {
    "ui_state": "Safari ouvert sur la page d'accueil",
    "clickable_elements": [],
    "next_action": {"type": "done", "target": None, "value": None, "x": None, "y": None},
    "goal_progress": 100,
    "goal_achieved": True,
    "reasoning": "Safari est maintenant ouvert, l'objectif est atteint",
}


def _make_anthropic_response(json_data: dict) -> MagicMock:
    """Construit un mock de réponse anthropic.messages.create."""
    content_block = MagicMock()
    content_block.text = json.dumps(json_data)
    response = MagicMock()
    response.content = [content_block]
    return response


@pytest.fixture
def client():
    """TestClient FastAPI sans démarrage de serveur réel."""
    return TestClient(app)


# ─── Tests unitaires — understand_screen ─────────────────────────────────────


class TestUnderstandScreen:
    """Tests directs de la fonction understand_screen (sans HTTP)."""

    @pytest.mark.asyncio
    async def test_parse_valid_response(self, monkeypatch):
        """Une réponse Claude valide est correctement parsée en VisionAnalysis."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _make_anthropic_response(_VALID_VISION_JSON)

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            result = await understand_screen(_PIXEL_B64, "Ouvre Safari")

        assert isinstance(result, VisionAnalysis)
        assert result.goal_achieved is False
        assert result.goal_progress == 10
        assert result.next_action.type == "click"
        assert len(result.clickable_elements) == 2
        assert result.clickable_elements[0].label == "Safari"

    @pytest.mark.asyncio
    async def test_parse_done_action(self, monkeypatch):
        """Une réponse avec goal_achieved=True est correctement gérée."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _make_anthropic_response(_DONE_VISION_JSON)

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            result = await understand_screen(_PIXEL_B64, "Ouvre Safari")

        assert result.goal_achieved is True
        assert result.goal_progress == 100
        assert result.next_action.type == "done"

    @pytest.mark.asyncio
    async def test_strips_markdown_code_block(self, monkeypatch):
        """La réponse wrappée dans ```json ... ``` est correctement nettoyée."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        content_block = MagicMock()
        content_block.text = "```json\n" + json.dumps(_VALID_VISION_JSON) + "\n```"
        response = MagicMock()
        response.content = [content_block]

        mock_client = MagicMock()
        mock_client.messages.create.return_value = response

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            result = await understand_screen(_PIXEL_B64, "Ouvre Safari")

        assert isinstance(result, VisionAnalysis)
        assert result.next_action.type == "click"

    @pytest.mark.asyncio
    async def test_strips_bare_code_block(self, monkeypatch):
        """La réponse wrappée dans ``` ... ``` (sans json) est nettoyée."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        content_block = MagicMock()
        content_block.text = "```\n" + json.dumps(_VALID_VISION_JSON) + "\n```"
        response = MagicMock()
        response.content = [content_block]

        mock_client = MagicMock()
        mock_client.messages.create.return_value = response

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            result = await understand_screen(_PIXEL_B64, "Ouvre Safari")

        assert isinstance(result, VisionAnalysis)

    @pytest.mark.asyncio
    async def test_raises_on_missing_api_key(self, monkeypatch):
        """ValueError si ANTHROPIC_API_KEY n'est pas configurée."""
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

        with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            await understand_screen(_PIXEL_B64, "Ouvre Safari")

    @pytest.mark.asyncio
    async def test_raises_on_invalid_json(self, monkeypatch):
        """RuntimeError si Claude renvoie du JSON invalide."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        content_block = MagicMock()
        content_block.text = "Voici mon analyse : {invalide json ici"
        response = MagicMock()
        response.content = [content_block]

        mock_client = MagicMock()
        mock_client.messages.create.return_value = response

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            with pytest.raises(RuntimeError, match="JSON"):
                await understand_screen(_PIXEL_B64, "Ouvre Safari")

    @pytest.mark.asyncio
    async def test_raises_on_unexpected_structure(self, monkeypatch):
        """RuntimeError si le JSON ne correspond pas au schéma VisionAnalysis."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        # JSON valide mais structure incorrecte (champs manquants)
        bad_data = {"ui_state": "quelque chose", "wrong_field": 42}

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _make_anthropic_response(bad_data)

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            with pytest.raises(RuntimeError, match="inattendue"):
                await understand_screen(_PIXEL_B64, "Ouvre Safari")

    @pytest.mark.asyncio
    async def test_history_truncated_to_5(self, monkeypatch):
        """L'historique est limité aux 5 dernières entrées dans le prompt."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _make_anthropic_response(_VALID_VISION_JSON)

        history = [
            {"action": f"action_{i}", "result": f"ok_{i}"}
            for i in range(10)  # 10 entrées → seulement les 5 dernières dans le prompt
        ]

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            await understand_screen(_PIXEL_B64, "test", history=history)

        call_args = mock_client.messages.create.call_args
        prompt_text = call_args[1]["messages"][0]["content"][1]["text"]

        # Les 5 premières actions (action_0..4) ne doivent PAS apparaître
        assert "action_0" not in prompt_text
        assert "action_4" not in prompt_text
        # Les 5 dernières (action_5..9) doivent apparaître
        assert "action_5" in prompt_text
        assert "action_9" in prompt_text

    @pytest.mark.asyncio
    async def test_no_history_text_if_empty(self, monkeypatch):
        """Aucun bloc "Actions précédentes" si history est vide."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _make_anthropic_response(_VALID_VISION_JSON)

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            await understand_screen(_PIXEL_B64, "test", history=[])

        call_args = mock_client.messages.create.call_args
        prompt_text = call_args[1]["messages"][0]["content"][1]["text"]
        assert "Actions précédentes" not in prompt_text

    @pytest.mark.asyncio
    async def test_image_sent_as_base64(self, monkeypatch):
        """Le screenshot est bien passé comme image base64 à l'API."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

        mock_client = MagicMock()
        mock_client.messages.create.return_value = _make_anthropic_response(_VALID_VISION_JSON)

        with patch("agents.perception.services.vision_service.anthropic.Anthropic", return_value=mock_client):
            await understand_screen(_PIXEL_B64, "test")

        call_args = mock_client.messages.create.call_args
        image_content = call_args[1]["messages"][0]["content"][0]
        assert image_content["type"] == "image"
        assert image_content["source"]["type"] == "base64"
        assert image_content["source"]["data"] == _PIXEL_B64
        assert image_content["source"]["media_type"] == "image/png"


# ─── Tests endpoint HTTP — /vision_understand ─────────────────────────────────


class TestVisionUnderstandEndpoint:
    """Tests de l'endpoint POST /vision_understand via TestClient."""

    def _patch_vision(self, monkeypatch, analysis: VisionAnalysis | None = None, exc=None):
        """Helper : mock vision_service.understand_screen dans l'agent."""
        if exc is not None:
            mock = AsyncMock(side_effect=exc)
        else:
            mock = AsyncMock(return_value=analysis or VisionAnalysis(**_VALID_VISION_JSON))

        monkeypatch.setattr(
            "agents.perception.perception_agent.vision_service.understand_screen",
            mock,
        )
        return mock

    def test_vision_understand_200(self, client, monkeypatch):
        """Réponse 200 avec analyse bien formée."""
        self._patch_vision(monkeypatch)
        resp = client.post("/vision_understand", json={
            "screenshot_b64": _PIXEL_B64,
            "goal": "Ouvre Safari",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "analysis" in data
        assert data["analysis"]["goal_achieved"] is False
        assert data["analysis"]["next_action"]["type"] == "click"

    def test_vision_understand_has_clickable_elements(self, client, monkeypatch):
        """La réponse contient la liste des éléments cliquables."""
        self._patch_vision(monkeypatch)
        data = client.post("/vision_understand", json={
            "screenshot_b64": _PIXEL_B64,
            "goal": "Ouvre Safari",
        }).json()
        assert isinstance(data["analysis"]["clickable_elements"], list)
        assert len(data["analysis"]["clickable_elements"]) == 2

    def test_vision_understand_goal_progress(self, client, monkeypatch):
        """goal_progress est bien transmis dans la réponse."""
        self._patch_vision(monkeypatch)
        data = client.post("/vision_understand", json={
            "screenshot_b64": _PIXEL_B64,
            "goal": "test",
        }).json()
        assert data["analysis"]["goal_progress"] == 10

    def test_vision_understand_400_missing_api_key(self, client, monkeypatch):
        """400 si ANTHROPIC_API_KEY manquante (ValueError du service)."""
        self._patch_vision(monkeypatch, exc=ValueError("ANTHROPIC_API_KEY non configurée"))
        resp = client.post("/vision_understand", json={
            "screenshot_b64": _PIXEL_B64,
            "goal": "test",
        })
        assert resp.status_code == 400
        assert "ANTHROPIC_API_KEY" in resp.json()["detail"]

    def test_vision_understand_502_invalid_response(self, client, monkeypatch):
        """502 si la réponse Claude est invalide (RuntimeError du service)."""
        self._patch_vision(monkeypatch, exc=RuntimeError("Réponse Claude Vision invalide (JSON)"))
        resp = client.post("/vision_understand", json={
            "screenshot_b64": _PIXEL_B64,
            "goal": "test",
        })
        assert resp.status_code == 502

    def test_vision_understand_with_history(self, client, monkeypatch):
        """L'historique est bien transmis au service."""
        mock = self._patch_vision(monkeypatch)
        history = [
            {"action": "click Safari", "result": "fenêtre ouverte"},
        ]
        client.post("/vision_understand", json={
            "screenshot_b64": _PIXEL_B64,
            "goal": "Charge google.com",
            "history": history,
        })
        call_kwargs = mock.call_args[1]
        assert call_kwargs["history"] == history
        assert call_kwargs["goal"] == "Charge google.com"

    def test_vision_understand_empty_history_default(self, client, monkeypatch):
        """history est optionnel : [] par défaut si non fourni."""
        mock = self._patch_vision(monkeypatch)
        client.post("/vision_understand", json={
            "screenshot_b64": _PIXEL_B64,
            "goal": "test",
        })
        call_kwargs = mock.call_args[1]
        assert call_kwargs["history"] == []

    def test_vision_understand_422_missing_goal(self, client):
        """422 si le champ goal est absent (validation Pydantic)."""
        resp = client.post("/vision_understand", json={"screenshot_b64": _PIXEL_B64})
        assert resp.status_code == 422

    def test_vision_understand_422_missing_screenshot(self, client):
        """422 si le champ screenshot_b64 est absent (validation Pydantic)."""
        resp = client.post("/vision_understand", json={"goal": "test"})
        assert resp.status_code == 422

    def test_vision_understand_done_action(self, client, monkeypatch):
        """goal_achieved=True est correctement renvoyé pour une action done."""
        self._patch_vision(monkeypatch, analysis=VisionAnalysis(**_DONE_VISION_JSON))
        data = client.post("/vision_understand", json={
            "screenshot_b64": _PIXEL_B64,
            "goal": "Ouvre Safari",
        }).json()
        assert data["analysis"]["goal_achieved"] is True
        assert data["analysis"]["goal_progress"] == 100
        assert data["analysis"]["next_action"]["type"] == "done"
