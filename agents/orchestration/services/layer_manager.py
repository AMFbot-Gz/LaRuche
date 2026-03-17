"""
layer_manager.py — Gestion du cycle de vie des couches agents Chimera

- Démarre/arrête les agents Python via subprocess
- Health check asynce (httpx)
- Hibernation automatique des couches niveau 1 après HIBERNATE_TIMEOUT secondes d'inactivité
- Singleton get_manager() pour import depuis orchestration_agent.py
"""
from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Optional

import httpx

ROOT = Path(__file__).resolve().parent.parent.parent.parent  # monorepo root

# ─── Définition des couches ───────────────────────────────────────────────────
# level 0 = couche noyau (toujours up)
# level 1 = couche optionnelle (hibernée si inactive)

LAYERS: dict[str, dict] = {
    "orchestration": {"module": "agents.orchestration.orchestration_agent:app", "port": 8001, "level": 0},
    "perception":    {"module": "agents.perception.perception_agent:app",        "port": 8002, "level": 1},
    "brain":         {"module": "agents.brain.brain:app",                        "port": 8003, "level": 0},
    "executor":      {"module": "agents.executor.executor_agent:app",            "port": 8004, "level": 1},
    "evolution":     {"module": "agents.evolution.auto_coder_bee:app",           "port": 8005, "level": 1},
    "memory":        {"module": "agents.memory.memory_agent:app",                "port": 8006, "level": 0},
    "mcp_bridge":    {"module": "agents.mcp-bridge.mcp_bridge_agent:app",        "port": 8007, "level": 1},
    "voice":         {"module": "agents.voice.voice_agent:app",                  "port": 8010, "level": 1},
}

HIBERNATE_TIMEOUT  = 300   # secondes d'inactivité avant hibernation
EVOLUTION_INTERVAL = 3600  # secondes entre deux cycles auto-évolution


class LayerManager:
    def __init__(self) -> None:
        self._pids:          dict[str, Optional[int]]   = {n: None for n in LAYERS}
        self._last_activity: dict[str, Optional[float]] = {n: None for n in LAYERS}
        self._locks:         dict[str, asyncio.Lock]    = {n: asyncio.Lock() for n in LAYERS}
        self._last_evolution = 0.0

        self._pids_dir = ROOT / ".chimera" / "pids"
        self._logs_dir = ROOT / ".chimera" / "logs"
        self._pids_dir.mkdir(parents=True, exist_ok=True)
        self._logs_dir.mkdir(parents=True, exist_ok=True)

    # ── Health checks ─────────────────────────────────────────────────────────

    def is_up(self, port: int) -> bool:
        try:
            with httpx.Client(timeout=2.0) as c:
                return c.get(f"http://127.0.0.1:{port}/health").status_code == 200
        except Exception:
            return False

    async def _health_async(self, port: int) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as c:
                return (await c.get(f"http://127.0.0.1:{port}/health")).status_code == 200
        except Exception:
            return False

    # ── Démarrage / arrêt ─────────────────────────────────────────────────────

    async def start_layer(self, name: str) -> None:
        cfg      = LAYERS[name]
        log_path = self._logs_dir / f"{name}.log"
        log_fh   = open(log_path, "a")  # noqa: WPS515

        proc = subprocess.Popen(
            ["uv", "run", "uvicorn", cfg["module"],
             "--host", "127.0.0.1", "--port", str(cfg["port"])],
            cwd=str(ROOT),
            stdout=log_fh,
            stderr=log_fh,
        )
        self._pids[name] = proc.pid
        (self._pids_dir / f"{name}.pid").write_text(str(proc.pid))

        for _ in range(3):
            await asyncio.sleep(1.5)
            if await self._health_async(cfg["port"]):
                self._last_activity[name] = time.time()
                return
        raise RuntimeError(f"Layer '{name}' health check failed after 3 retries")

    async def stop_layer(self, name: str) -> None:
        pid = self._pids.get(name)
        pid_file = self._pids_dir / f"{name}.pid"
        if pid is None and pid_file.exists():
            try:
                pid = int(pid_file.read_text().strip())
            except ValueError:
                pid = None

        if pid is not None:
            try:
                os.kill(pid, signal.SIGTERM)
                await asyncio.sleep(3)
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            except ProcessLookupError:
                pass

        self._pids[name] = None
        self._last_activity[name] = None
        if pid_file.exists():
            pid_file.unlink()

    # ── ensure_layer : démarre si nécessaire ──────────────────────────────────

    async def ensure_layer(self, name: str) -> bool:
        cfg = LAYERS.get(name)
        if cfg is None:
            return False
        if self.is_up(cfg["port"]):
            self._last_activity[name] = time.time()
            return True
        async with self._locks[name]:
            if self.is_up(cfg["port"]):
                self._last_activity[name] = time.time()
                return True
            try:
                await self.start_layer(name)
                return True
            except RuntimeError:
                return False

    def touch_layer(self, name: str) -> None:
        self._last_activity[name] = time.time()

    # ── Boucle d'hibernation ──────────────────────────────────────────────────

    def _mission_running(self) -> bool:
        try:
            with httpx.Client(timeout=2.0) as c:
                data = c.get(f"http://127.0.0.1:{LAYERS['orchestration']['port']}/mission/status").json()
                return bool(data.get("running"))
        except Exception:
            return False

    async def hibernate_loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            now             = time.time()
            mission_running = self._mission_running()

            for name, cfg in LAYERS.items():
                if cfg["level"] == 1 and not mission_running:
                    last = self._last_activity.get(name)
                    if last is not None and (now - last) > HIBERNATE_TIMEOUT:
                        if self.is_up(cfg["port"]):
                            await self.stop_layer(name)

    # ── Status ────────────────────────────────────────────────────────────────

    def get_status(self) -> dict[str, dict]:
        status: dict[str, dict] = {}
        for name, cfg in LAYERS.items():
            pid_file = self._pids_dir / f"{name}.pid"
            pid = self._pids.get(name)
            if pid is None and pid_file.exists():
                try:
                    pid = int(pid_file.read_text().strip())
                except ValueError:
                    pid = None
            status[name] = {
                "up":            self.is_up(cfg["port"]),
                "port":          cfg["port"],
                "level":         cfg["level"],
                "last_activity": self._last_activity.get(name),
                "pid":           pid,
            }
        return status


# ─── Singleton ────────────────────────────────────────────────────────────────

_manager: Optional[LayerManager] = None


def get_manager() -> LayerManager:
    global _manager
    if _manager is None:
        _manager = LayerManager()
    return _manager
