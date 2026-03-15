"""
tests/test_mcp_bridge.py — Tests du MCP-Bridge Agent (min 20 tests)

Stratégie : mock McpClient pour éviter les appels HTTP réels vers la Queen.
Les tests vérifient le comportement de l'API dans les cas :
  - Queen disponible
  - Queen indisponible (dégradation gracieuse)
  - Cas limites (outil inconnu, timeout, etc.)
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from mcp_bridge_agent import app
from services.mcp_client import KNOWN_TOOLS, McpClient

# ─── Fixtures ─────────────────────────────────────────────────────────────────

# Outils simulés retournés quand la Queen est disponible
MOCK_TOOLS_QUEEN = [
    {"name": "take_screenshot",   "description": "Capture l'écran",           "params": {}},
    {"name": "type_text",         "description": "Tape du texte",              "params": {"text": "string"}},
    {"name": "run_command",       "description": "Exécute une commande shell", "params": {"command": "string"}},
]


def _make_call_result(
    success: bool = True,
    result: Any = {"data": "ok"},
    error: str | None = None,
    duration_ms: int = 42,
) -> tuple[dict, bool]:
    """Fabrique un tuple (result_dict, queen_available) pour mock call_tool."""
    return {
        "success": success,
        "result": result,
        "error": error,
        "duration_ms": duration_ms,
    }, success or error != "Queen unavailable"


@pytest.fixture
def client():
    """Client de test FastAPI synchrone."""
    return TestClient(app)


@pytest.fixture
def mock_queen_up():
    """Mock McpClient avec Queen disponible."""
    with (
        patch.object(McpClient, "is_queen_reachable", new_callable=AsyncMock, return_value=True),
        patch.object(McpClient, "list_tools", new_callable=AsyncMock, return_value=(MOCK_TOOLS_QUEEN, True)),
        patch.object(
            McpClient,
            "call_tool",
            new_callable=AsyncMock,
            return_value=(
                {"success": True, "result": {"data": "screenshot_ok"}, "error": None, "duration_ms": 55},
                True,
            ),
        ),
    ):
        yield


@pytest.fixture
def mock_queen_down():
    """Mock McpClient avec Queen indisponible."""
    with (
        patch.object(McpClient, "is_queen_reachable", new_callable=AsyncMock, return_value=False),
        patch.object(McpClient, "list_tools", new_callable=AsyncMock, return_value=(list(KNOWN_TOOLS), False)),
        patch.object(
            McpClient,
            "call_tool",
            new_callable=AsyncMock,
            return_value=(
                {"success": False, "result": None, "error": "Queen unavailable", "duration_ms": 1},
                False,
            ),
        ),
    ):
        yield


# ─── Tests /health ────────────────────────────────────────────────────────────


class TestHealth:
    def test_health_returns_200_when_queen_up(self, client, mock_queen_up):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_structure_complete(self, client, mock_queen_up):
        data = client.get("/health").json()
        assert "status" in data
        assert "service" in data
        assert "timestamp" in data
        assert "queen_reachable" in data
        assert "tools_count" in data

    def test_health_queen_reachable_true(self, client, mock_queen_up):
        data = client.get("/health").json()
        assert data["queen_reachable"] is True
        assert data["service"] == "mcp-bridge"

    def test_health_queen_down_returns_200_not_503(self, client, mock_queen_down):
        """CRITIQUE : doit retourner 200, pas 503, quand la Queen est down."""
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_queen_reachable_false_when_down(self, client, mock_queen_down):
        data = client.get("/health").json()
        assert data["queen_reachable"] is False

    def test_health_tools_count_nonzero_even_when_down(self, client, mock_queen_down):
        """Le fallback doit toujours fournir des outils."""
        data = client.get("/health").json()
        assert data["tools_count"] > 0


# ─── Tests /status ────────────────────────────────────────────────────────────


class TestStatus:
    def test_status_returns_200(self, client, mock_queen_up):
        resp = client.get("/status")
        assert resp.status_code == 200

    def test_status_structure_complete(self, client, mock_queen_up):
        data = client.get("/status").json()
        required = {"status", "service", "port", "timestamp", "queen_url", "queen_reachable", "tools_count", "source"}
        assert required.issubset(data.keys())

    def test_status_port_is_8007(self, client, mock_queen_up):
        data = client.get("/status").json()
        assert data["port"] == 8007

    def test_status_source_queen_when_up(self, client, mock_queen_up):
        data = client.get("/status").json()
        assert data["source"] == "queen"

    def test_status_source_fallback_when_down(self, client, mock_queen_down):
        data = client.get("/status").json()
        assert data["source"] == "fallback"


# ─── Tests /tools ─────────────────────────────────────────────────────────────


class TestTools:
    def test_tools_returns_200(self, client, mock_queen_up):
        resp = client.get("/tools")
        assert resp.status_code == 200

    def test_tools_list_non_empty(self, client, mock_queen_up):
        data = client.get("/tools").json()
        assert len(data["tools"]) > 0

    def test_tools_source_queen_when_up(self, client, mock_queen_up):
        data = client.get("/tools").json()
        assert data["source"] == "queen"
        assert data["queen_available"] is True

    def test_tools_fallback_when_queen_down(self, client, mock_queen_down):
        data = client.get("/tools").json()
        assert data["source"] == "fallback"
        assert data["queen_available"] is False

    def test_tools_fallback_contains_known_tools(self, client, mock_queen_down):
        data = client.get("/tools").json()
        tool_names = {t["name"] for t in data["tools"]}
        known_names = {t["name"] for t in KNOWN_TOOLS}
        assert known_names.issubset(tool_names)

    def test_tools_total_matches_list_length(self, client, mock_queen_up):
        data = client.get("/tools").json()
        assert data["total"] == len(data["tools"])

    def test_tools_each_has_name_and_description(self, client, mock_queen_up):
        data = client.get("/tools").json()
        for tool in data["tools"]:
            assert "name" in tool
            assert "description" in tool


# ─── Tests POST /call ─────────────────────────────────────────────────────────


class TestCallTool:
    def test_call_existing_tool_success(self, client, mock_queen_up):
        resp = client.post("/call", json={"tool": "take_screenshot"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["tool"] == "take_screenshot"

    def test_call_response_has_duration_ms(self, client, mock_queen_up):
        """duration_ms doit toujours être présent."""
        data = client.post("/call", json={"tool": "take_screenshot"}).json()
        assert "duration_ms" in data
        assert isinstance(data["duration_ms"], int)

    def test_call_queen_available_true_when_up(self, client, mock_queen_up):
        data = client.post("/call", json={"tool": "take_screenshot"}).json()
        assert data["queen_available"] is True

    def test_call_with_params(self, client, mock_queen_up):
        resp = client.post("/call", json={"tool": "run_command", "params": {"command": "ls"}})
        assert resp.status_code == 200

    def test_call_unknown_tool_returns_200_not_404(self, client, mock_queen_up):
        """Outil inconnu → 200 avec success selon la Queen, jamais 404."""
        resp = client.post("/call", json={"tool": "nonexistent_tool_xyz"})
        assert resp.status_code == 200

    def test_call_queen_down_success_false(self, client, mock_queen_down):
        data = client.post("/call", json={"tool": "take_screenshot"}).json()
        assert data["success"] is False

    def test_call_queen_down_error_message_present(self, client, mock_queen_down):
        data = client.post("/call", json={"tool": "take_screenshot"}).json()
        assert data["error"] is not None
        assert len(data["error"]) > 0

    def test_call_queen_down_queen_available_false(self, client, mock_queen_down):
        data = client.post("/call", json={"tool": "take_screenshot"}).json()
        assert data["queen_available"] is False

    def test_call_queen_down_duration_ms_present(self, client, mock_queen_down):
        """duration_ms doit être présent même quand la Queen est down."""
        data = client.post("/call", json={"tool": "take_screenshot"}).json()
        assert "duration_ms" in data
        assert isinstance(data["duration_ms"], int)

    def test_call_custom_timeout_accepted(self, client, mock_queen_up):
        resp = client.post("/call", json={"tool": "take_screenshot", "timeout": 60})
        assert resp.status_code == 200

    def test_call_tool_name_in_response(self, client, mock_queen_up):
        data = client.post("/call", json={"tool": "run_command", "params": {"command": "pwd"}}).json()
        assert data["tool"] == "run_command"


# ─── Tests POST /call/{tool} (alias route) ────────────────────────────────────


class TestCallToolAlias:
    def test_alias_route_returns_200(self, client, mock_queen_up):
        resp = client.post("/call/take_screenshot", json={})
        assert resp.status_code == 200

    def test_alias_route_tool_name_from_url(self, client, mock_queen_up):
        data = client.post("/call/take_screenshot", json={}).json()
        assert data["tool"] == "take_screenshot"

    def test_alias_route_no_body(self, client, mock_queen_up):
        """La route alias doit fonctionner sans body."""
        resp = client.post("/call/take_screenshot")
        assert resp.status_code == 200

    def test_alias_route_with_params(self, client, mock_queen_up):
        resp = client.post(
            "/call/run_command",
            json={"tool": "run_command", "params": {"command": "echo hello"}},
        )
        assert resp.status_code == 200

    def test_alias_route_queen_down(self, client, mock_queen_down):
        data = client.post("/call/take_screenshot").json()
        assert data["queen_available"] is False
        assert data["success"] is False


# ─── Tests unitaires McpClient ────────────────────────────────────────────────


class TestMcpClientUnit:
    @pytest.mark.asyncio
    async def test_is_queen_reachable_false_on_connection_error(self):
        """Sans serveur, is_queen_reachable doit retourner False."""
        client = McpClient(queen_url="http://localhost:19999")
        result = await client.is_queen_reachable()
        assert result is False

    @pytest.mark.asyncio
    async def test_list_tools_fallback_on_connection_error(self):
        """Sans serveur, list_tools retourne KNOWN_TOOLS et queen_available=False."""
        client = McpClient(queen_url="http://localhost:19999")
        tools, available = await client.list_tools()
        assert available is False
        assert len(tools) == len(KNOWN_TOOLS)

    @pytest.mark.asyncio
    async def test_call_tool_queen_unavailable_returns_error(self):
        """Sans serveur, call_tool retourne success=False sans lever d'exception."""
        client = McpClient(queen_url="http://localhost:19999")
        result, available = await client.call_tool("take_screenshot", {})
        assert result["success"] is False
        assert "error" in result
        assert "duration_ms" in result

    def test_known_tools_has_9_entries(self):
        assert len(KNOWN_TOOLS) == 9

    def test_known_tools_all_have_required_fields(self):
        for tool in KNOWN_TOOLS:
            assert "name" in tool
            assert "description" in tool
