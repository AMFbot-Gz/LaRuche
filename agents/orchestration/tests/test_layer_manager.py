"""
tests/test_layer_manager.py — Tests pour LayerManager

Tests sans spawn réel de process.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from agents.orchestration.services.layer_manager import LayerManager, get_manager


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def manager(tmp_path) -> LayerManager:
    with patch("agents.orchestration.services.layer_manager.ROOT", tmp_path):
        m = LayerManager()
    return m


# ─── Tests ────────────────────────────────────────────────────────────────────


class TestLayerManager:
    def test_singleton(self, tmp_path):
        with patch("agents.orchestration.services.layer_manager.ROOT", tmp_path):
            m1 = get_manager()
            m2 = get_manager()
        assert m1 is m2

    def test_get_status_all_offline(self, manager: LayerManager):
        status = manager.get_status()
        assert isinstance(status, dict)
        for name, info in status.items():
            assert "up" in info
            assert "port" in info
            assert "level" in info
            assert info["up"] is False  # aucun agent démarré

    def test_touch_layer_updates_activity(self, manager: LayerManager):
        import time
        before = time.time()
        manager.touch_layer("brain")
        last = manager._last_activity.get("brain")
        assert last is not None
        assert last >= before

    def test_is_up_returns_false_when_offline(self, manager: LayerManager):
        assert manager.is_up(19999) is False

    @pytest.mark.asyncio
    async def test_ensure_layer_returns_false_when_not_startable(self, manager: LayerManager):
        """ensure_layer retourne False si le démarrage échoue."""
        with patch.object(manager, "is_up", return_value=False), \
             patch.object(manager, "start_layer", side_effect=RuntimeError("failed")):
            result = await manager.ensure_layer("brain")
        assert result is False

    @pytest.mark.asyncio
    async def test_ensure_layer_returns_true_if_already_up(self, manager: LayerManager):
        with patch.object(manager, "is_up", return_value=True):
            result = await manager.ensure_layer("brain")
        assert result is True

    def test_stop_layer_noop_when_no_pid(self, manager: LayerManager):
        """stop_layer ne plante pas si aucun PID connu."""
        import asyncio
        asyncio.get_event_loop().run_until_complete(manager.stop_layer("brain"))

    def test_pids_dir_created(self, manager: LayerManager):
        assert manager._pids_dir.exists()

    def test_logs_dir_created(self, manager: LayerManager):
        assert manager._logs_dir.exists()
