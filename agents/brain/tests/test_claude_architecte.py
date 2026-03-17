"""
tests/test_claude_architecte.py — Tests pour ClaudeArchitecte

Tests purs sans appels réseau ni appels Claude API.
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agents.brain.services.claude_architecte import (
    ClaudeArchitecte,
    execute_tool,
    get_architecte,
    tool_save_skill,
)


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def archi() -> ClaudeArchitecte:
    a = ClaudeArchitecte()
    return a


# ─── ClaudeArchitecte unit tests ─────────────────────────────────────────────


class TestClaudeArchitecte:
    def test_singleton(self):
        a1 = get_architecte()
        a2 = get_architecte()
        assert a1 is a2

    def test_reset_history(self, archi: ClaudeArchitecte):
        archi._history = [{"role": "user", "content": "test"}]
        archi.reset_history()
        assert archi._history == []

    def test_truncate_short_text(self, archi: ClaudeArchitecte):
        text = "court"
        assert archi._truncate(text) == text

    def test_truncate_long_text(self, archi: ClaudeArchitecte):
        long = "x" * 5000
        result = archi._truncate(long)
        assert len(result) < 5000
        assert "tronquée" in result

    def test_serialize_content_text(self, archi: ClaudeArchitecte):
        block = MagicMock()
        block.type = "text"
        block.text = "bonjour"
        result = archi._serialize_content([block])
        assert result == [{"type": "text", "text": "bonjour"}]

    def test_serialize_content_empty_text_ignored(self, archi: ClaudeArchitecte):
        block = MagicMock()
        block.type = "text"
        block.text = ""
        result = archi._serialize_content([block])
        assert result == []

    def test_serialize_content_tool_use(self, archi: ClaudeArchitecte):
        block = MagicMock()
        block.type = "tool_use"
        block.id   = "tu_123"
        block.name = "execute_shell"
        block.input = {"command": "ls"}
        result = archi._serialize_content([block])
        assert result == [{"type": "tool_use", "id": "tu_123", "name": "execute_shell", "input": {"command": "ls"}}]

    def test_serialize_content_thinking_ignored(self, archi: ClaudeArchitecte):
        block = MagicMock()
        block.type = "thinking"
        result = archi._serialize_content([block])
        assert result == []

    def test_get_client_raises_without_key(self, archi: ClaudeArchitecte):
        with patch.dict("os.environ", {}, clear=True):
            import os
            os.environ.pop("ANTHROPIC_API_KEY", None)
            with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
                archi._get_client()

    @pytest.mark.asyncio
    async def test_handle_message_end_turn(self, archi: ClaudeArchitecte):
        """Claude répond directement sans appels d'outils."""
        text_block = MagicMock()
        text_block.type = "text"
        text_block.text = "Bonjour de l'Architecte"

        mock_response = MagicMock()
        mock_response.stop_reason = "end_turn"
        mock_response.content     = [text_block]

        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(return_value=mock_response)

        archi._client = mock_client

        with patch.object(archi, "_build_system_prompt", return_value="system prompt"):
            result = await archi.handle_message("Bonjour")

        assert "Architecte" in result

    @pytest.mark.asyncio
    async def test_handle_message_timeout(self, archi: ClaudeArchitecte):
        mock_client = AsyncMock()
        mock_client.messages.create = AsyncMock(side_effect=asyncio.TimeoutError())

        archi._client = mock_client
        with patch.object(archi, "_build_system_prompt", return_value="system"):
            result = await archi.handle_message("test timeout")

        assert "Timeout" in result

    @pytest.mark.asyncio
    async def test_build_system_prompt_cached(self, archi: ClaudeArchitecte):
        archi._system_cache    = "cached prompt"
        from datetime import datetime, timezone
        archi._system_cache_ts = datetime.now(timezone.utc)
        prompt = await archi._build_system_prompt()
        assert prompt == "cached prompt"


# ─── execute_tool ─────────────────────────────────────────────────────────────


class TestExecuteTool:
    @pytest.mark.asyncio
    async def test_unknown_tool(self):
        result = await execute_tool("does_not_exist", {})
        assert "_error" in result
        assert "inconnu" in result["_error"]

    @pytest.mark.asyncio
    async def test_get_ruche_status_offline(self):
        """Tous les agents offline → retourne quand même un dict structuré."""
        result = await execute_tool("get_ruche_status", {})
        assert "layers" in result
        assert "online" in result


# ─── tool_save_skill ──────────────────────────────────────────────────────────


class TestToolSaveSkill:
    @pytest.mark.asyncio
    async def test_saves_files(self, tmp_path: Path):
        with patch("agents.brain.services.claude_architecte.ROOT", tmp_path):
            result = await tool_save_skill({
                "name":        "test_skill",
                "description": "Un skill de test",
                "code":        "export async function run() { return 'ok'; }",
            })
        assert result["success"] is True
        skill_dir = tmp_path / "skills" / "test_skill"
        assert (skill_dir / "skill.js").exists()
        assert (skill_dir / "manifest.json").exists()

    @pytest.mark.asyncio
    async def test_updates_registry(self, tmp_path: Path):
        with patch("agents.brain.services.claude_architecte.ROOT", tmp_path):
            await tool_save_skill({"name": "skill_a", "description": "A", "code": "// a"})
            await tool_save_skill({"name": "skill_b", "description": "B", "code": "// b"})

        registry = json.loads((tmp_path / "skills" / "registry.json").read_text())
        names = [s["name"] for s in registry["skills"]]
        assert "skill_a" in names
        assert "skill_b" in names

    @pytest.mark.asyncio
    async def test_name_sanitized(self, tmp_path: Path):
        with patch("agents.brain.services.claude_architecte.ROOT", tmp_path):
            result = await tool_save_skill({
                "name":        "My Skill! @#$",
                "description": "Test",
                "code":        "// ok",
            })
        assert result["success"] is True
        assert " " not in result["skill"]
        assert "!" not in result["skill"]
