"""
tests/test_memory_agent.py — Tests for the Memory Agent.

Tests are split into:
  - AgentMemory (service layer): uses a temp directory, no ChromaDB required
  - API layer: FastAPI TestClient with a mocked AgentMemory
"""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ─── Service layer tests ──────────────────────────────────────────────────────


class TestAgentMemoryService:
    """
    Tests the AgentMemory class directly without ChromaDB or embeddings.
    Uses a temp directory to avoid touching real data files.
    """

    @pytest.fixture
    def mem(self, tmp_path: Path):
        """AgentMemory with no ChromaDB, no embeddings (graceful degradation)."""
        from agents.memory.memory import AgentMemory, VAULT_DIR, VECTOR_DIR, STATE_FILE

        # Patch paths to use tmp_path
        with (
            patch("agents.memory.memory.VAULT_DIR", tmp_path / "vault"),
            patch("agents.memory.memory.VECTOR_DIR", tmp_path / "vector_store"),
            patch("agents.memory.memory.STATE_FILE", tmp_path / "state.json"),
            patch("agents.memory.memory.PATTERNS_FILE", tmp_path / "patterns.json"),
            patch("agents.memory.memory.ACTIONS_LOG", tmp_path / "actions.log"),
        ):
            (tmp_path / "vault").mkdir(parents=True)
            (tmp_path / "vector_store").mkdir(parents=True)
            m = AgentMemory.__new__(AgentMemory)
            import threading
            from collections import OrderedDict
            m._lock = threading.RLock()
            m._encoder = None
            m._encoder_type = "none"
            m._embed_cache = MagicMock()
            m._embed_cache.get.return_value = None
            m._chroma = None
            m._collection = None
            m._state = {
                "tasks_success": 0,
                "tasks_failed": 0,
                "working_memory": [],
                "total_actions": 0,
                "uptime_start": time.time(),
            }
            yield m, tmp_path

    def test_save_experience_creates_vault_file(self, mem):
        m, tmp = mem
        import json
        vault = tmp / "vault"

        with (
            patch("agents.memory.memory.VAULT_DIR", vault),
            patch.object(m, "_save_state"),
            patch.object(m, "_log"),
            patch.object(m, "_extract_patterns"),
        ):
            result_id = m.save_experience(
                task="Test task description",
                result={"success": True},
                screen_after="test screen",
            )

        files = list(vault.glob("exp_*.json"))
        assert len(files) == 1

    def test_save_experience_increments_success_counter(self, mem):
        m, tmp = mem
        vault = tmp / "vault"

        with (
            patch("agents.memory.memory.VAULT_DIR", vault),
            patch.object(m, "_save_state"),
            patch.object(m, "_log"),
        ):
            m.save_experience(task="Task 1", result={"success": True})
            m.save_experience(task="Task 2", result={"success": True})
            m.save_experience(task="Task 3", result={"success": False})

        assert m._state["tasks_success"] == 2
        assert m._state["tasks_failed"] == 1

    def test_get_state_returns_uptime(self, mem):
        m, _ = mem
        state = m.get_state()
        assert "uptime" in state
        assert isinstance(state["uptime"], int)
        assert state["uptime"] >= 0

    def test_update_working_memory_keeps_fifo_10(self, mem):
        m, _ = mem
        with patch.object(m, "_save_state"):
            for i in range(15):
                m.update_working_memory(f"action_{i}", "ok")
        assert len(m._state["working_memory"]) == 10
        # Most recent 10 kept
        assert m._state["working_memory"][-1]["action"] == "action_14"

    def test_count_experiences_zero_on_empty_vault(self, mem):
        m, tmp = mem
        with patch("agents.memory.memory.VAULT_DIR", tmp / "vault"):
            count = m._count_experiences()
        assert count == 0

    def test_fallback_search_returns_empty_without_files(self, mem):
        m, tmp = mem
        with patch("agents.memory.memory.VAULT_DIR", tmp / "vault"):
            result = m._fallback_search("find something")
        assert isinstance(result, str)

    def test_encode_returns_zero_vector_without_encoder(self, mem):
        import numpy as np
        m, _ = mem
        vec = m.encode("hello world")
        assert vec.shape == (384,)
        assert np.all(vec == 0)


# ─── API layer tests ─────────────────────────────────────────────────────────


class TestMemoryAgentAPI:
    """Tests the FastAPI endpoints using TestClient with a mocked AgentMemory."""

    @pytest.fixture(autouse=True)
    def mock_memory(self):
        """Replace the module-level _memory singleton with a mock."""
        mock = MagicMock()
        mock.get_state.return_value = {
            "tasks_success": 5,
            "tasks_failed":  2,
            "uptime":        3600,
        }
        mock._count_experiences.return_value = 7
        mock._collection = MagicMock()  # truthy → chromadb_available = True
        mock._encoder    = MagicMock()  # truthy → embeddings_available = True
        mock.save_experience.return_value = "/tmp/exp_123.json"
        mock._query_chroma.return_value   = []
        mock.get_context_for_task.return_value = ""
        mock.get_patterns_for_task.return_value = ""
        mock.compress_old_memories.return_value = 3

        import agents.memory.memory_agent as mod
        original = mod._memory
        mod._memory = mock
        yield mock
        mod._memory = original

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        from agents.memory.memory_agent import app
        return TestClient(app)

    def test_health_returns_ok(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        assert r.json()["service"] == "memory"

    def test_status_returns_stats(self, client):
        r = client.get("/status")
        assert r.status_code == 200
        data = r.json()
        assert data["tasks_success"] == 5
        assert data["total_experiences"] == 7
        assert data["chromadb_available"] is True

    def test_save_memory_returns_stored(self, client):
        r = client.post("/memories", json={
            "task": "Count Python files in /tmp",
            "success": True,
        })
        assert r.status_code == 200
        assert r.json()["stored"] is True
        assert "memory_id" in r.json()

    def test_save_memory_rejects_short_task(self, client):
        r = client.post("/memories", json={"task": "Hi"})
        assert r.status_code == 422

    def test_search_memories_returns_results(self, client):
        r = client.get("/memories/search", params={"q": "python file sorting"})
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert "query" in data
        assert data["query"] == "python file sorting"

    def test_search_requires_min_3_chars(self, client):
        r = client.get("/memories/search", params={"q": "ab"})
        assert r.status_code == 422

    def test_context_endpoint(self, client):
        r = client.get("/memories/context", params={"task": "sort a list in python"})
        assert r.status_code == 200
        assert "context_block" in r.json()

    def test_compress_endpoint(self, client):
        r = client.post("/memories/compress", params={"keep_days": 30})
        assert r.status_code == 200
        assert r.json()["compressed"] == 3
