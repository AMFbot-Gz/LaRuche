"""
goals_agent.py — Agent d'objectifs autonomes Chimera (:8010)

Adapté depuis ruche-corps/goals.py.

GoalsLoop : génère ses propres objectifs, les priorise, les exécute et
            apprend de ses résultats. Stockage SQLite local.

Boucle : toutes les 30min → check objectifs → exécute le plus urgent → log résultat
Génération auto : toutes les 6h → demande à Ollama 3 nouveaux objectifs

Endpoints :
  GET  /health         — liveness check
  GET  /goals          — liste les objectifs actifs/pending
  POST /goals          — ajouter un objectif manuellement
  GET  /status         — statistiques d'exécution

Lancement :
  uvicorn agents.goals.goals_agent:app --port 8010 --reload
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import httpx
import psutil
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ─── Config ───────────────────────────────────────────────────────────────────

OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
MODEL_GENERAL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")

# Base SQLite dans le dossier home de l'utilisateur
GOALS_DB = Path.home() / ".chimera" / "goals.db"
GOALS_DB.parent.mkdir(parents=True, exist_ok=True)

# Intervalle entre chaque cycle d'exécution (30 min)
LOOP_INTERVAL_SEC = 30 * 60
# Intervalle entre chaque génération automatique d'objectifs (6h)
GENERATE_INTERVAL_SEC = 6 * 60 * 60

log = logging.getLogger("chimera.goals")


# ─── Enums & modèles ──────────────────────────────────────────────────────────


class GoalStatus(Enum):
    PENDING = "pending"
    ACTIVE = "active"
    DONE = "done"
    FAILED = "failed"
    DEFERRED = "deferred"


class Goal:
    """Représente un objectif autonome."""

    def __init__(
        self,
        id: str,
        description: str,
        priority: int,
        category: str,
        status: str = GoalStatus.PENDING.value,
        created_at: str | None = None,
        executed_at: str | None = None,
        result: str | None = None,
        error: str | None = None,
        mission_id: str | None = None,
        learned: str | None = None,
    ) -> None:
        self.id = id
        self.description = description
        self.priority = priority
        self.category = category
        self.status = status
        self.created_at = created_at or datetime.now().isoformat()
        self.executed_at = executed_at
        self.result = result
        self.error = error
        self.mission_id = mission_id
        self.learned = learned

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "description": self.description,
            "priority": self.priority,
            "category": self.category,
            "status": self.status,
            "created_at": self.created_at,
            "executed_at": self.executed_at,
            "result": self.result,
            "error": self.error,
            "mission_id": self.mission_id,
            "learned": self.learned,
        }

    @classmethod
    def from_row(cls, row: tuple) -> "Goal":
        return cls(
            id=row[0],
            description=row[1],
            priority=row[2],
            category=row[3],
            status=row[4],
            created_at=row[5],
            executed_at=row[6],
            result=row[7],
            error=row[8],
            mission_id=row[9],
            learned=row[10],
        )


# ─── Schemas Pydantic (API) ───────────────────────────────────────────────────


class AddGoalRequest(BaseModel):
    description: str
    priority: int = 5
    category: str = "general"


class GoalOut(BaseModel):
    id: str
    description: str
    priority: int
    category: str
    status: str
    created_at: str
    executed_at: Optional[str] = None
    result: Optional[str] = None
    learned: Optional[str] = None


# ─── GoalsLoop ────────────────────────────────────────────────────────────────


class GoalsLoop:
    """
    Génère et exécute des objectifs autonomes.

    La boucle principale tourne en background dès le démarrage de l'agent.
    Peut aussi être utilisée sans Redis (mode dégradé : objectifs jamais exécutés
    mais stockés).
    """

    def __init__(self) -> None:
        self._db_path = GOALS_DB
        self._last_generated = 0.0
        self._init_db()

    # ─── SQLite ───────────────────────────────────────────────────────────────

    def _init_db(self) -> None:
        """Crée la table goals si elle n'existe pas."""
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS goals (
                    id          TEXT PRIMARY KEY,
                    description TEXT NOT NULL,
                    priority    INTEGER NOT NULL DEFAULT 5,
                    category    TEXT NOT NULL DEFAULT 'general',
                    status      TEXT NOT NULL DEFAULT 'pending',
                    created_at  TEXT,
                    executed_at TEXT,
                    result      TEXT,
                    error       TEXT,
                    mission_id  TEXT,
                    learned     TEXT
                )
            """)
            conn.commit()

    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self._db_path))

    # ─── CRUD ────────────────────────────────────────────────────────────────

    def add_goal(
        self,
        description: str,
        priority: int = 5,
        category: str = "general",
    ) -> str:
        """Ajoute un objectif. Retourne son ID."""
        gid = f"g_{uuid.uuid4().hex[:8]}"
        with self._get_conn() as conn:
            conn.execute(
                """INSERT INTO goals (id, description, priority, category, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (gid, description, priority, category,
                 GoalStatus.PENDING.value, datetime.now().isoformat()),
            )
            conn.commit()
        log.info("goal_added: [%s] %s", gid, description[:60])
        return gid

    def _update_goal(self, goal: Goal) -> None:
        with self._get_conn() as conn:
            conn.execute(
                """UPDATE goals SET
                    description=?, priority=?, category=?, status=?,
                    executed_at=?, result=?, error=?, mission_id=?, learned=?
                   WHERE id=?""",
                (goal.description, goal.priority, goal.category, goal.status,
                 goal.executed_at, goal.result, goal.error,
                 goal.mission_id, goal.learned, goal.id),
            )
            conn.commit()

    def list_goals(self) -> list[Goal]:
        """Retourne tous les objectifs actifs ou en attente."""
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM goals WHERE status IN ('pending','active') ORDER BY priority DESC"
            ).fetchall()
        return [Goal.from_row(r) for r in rows]

    def get_stats(self) -> dict[str, Any]:
        """Statistiques d'exécution."""
        with self._get_conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM goals").fetchone()[0]
            done = conn.execute("SELECT COUNT(*) FROM goals WHERE status='done'").fetchone()[0]
            failed = conn.execute("SELECT COUNT(*) FROM goals WHERE status='failed'").fetchone()[0]
            pending = conn.execute("SELECT COUNT(*) FROM goals WHERE status='pending'").fetchone()[0]
            active = conn.execute("SELECT COUNT(*) FROM goals WHERE status='active'").fetchone()[0]
        success_rate = round(done / (done + failed) * 100) if (done + failed) > 0 else 0
        return {
            "total": total,
            "done": done,
            "failed": failed,
            "pending": pending,
            "active": active,
            "success_rate": success_rate,
        }

    # ─── Logique ──────────────────────────────────────────────────────────────

    async def pick_next(self) -> Optional[Goal]:
        """Sélectionne l'objectif pending de plus haute priorité."""
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM goals WHERE status='pending' ORDER BY priority DESC LIMIT 1"
            ).fetchone()
        return Goal.from_row(row) if row else None

    async def generate_goals(self) -> int:
        """Demande à Ollama de proposer 3 nouveaux objectifs basés sur l'état système."""
        try:
            disk = psutil.disk_usage("/")
            mem = psutil.virtual_memory()
            disk_pct = disk.percent
            mem_pct = mem.percent
        except Exception:
            disk_pct = mem_pct = 0.0

        recent_errors = self._get_recent_errors()

        prompt = (
            f"En tant qu'agent IA autonome sur macOS, "
            f"basé sur l'état système actuel [disk={disk_pct}%, mem={mem_pct}%, "
            f"recent_errors={recent_errors}], "
            f"propose 3 objectifs utiles et réalisables pour améliorer le système. "
            f'Format JSON uniquement (sans markdown) : '
            f'[{{"description": "...", "priority": 1-10, '
            f'"category": "maintenance|monitoring|optimization|learning|reporting"}}]'
        )

        data: list = []
        try:
            async with httpx.AsyncClient(timeout=60.0) as c:
                resp = await c.post(
                    f"{OLLAMA}/api/chat",
                    json={
                        "model": MODEL_GENERAL,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False,
                        "options": {"temperature": 0.7, "num_predict": 600},
                    },
                )
            raw = resp.json().get("message", {}).get("content", "[]")
            m = re.search(r"\[[\s\S]*\]", raw)
            data = json.loads(m.group()) if m else []
        except Exception as exc:
            log.warning("goals_generation_failed: %s", exc)

        valid_cats = {"maintenance", "monitoring", "optimization", "learning", "reporting"}
        added = 0
        for item in data[:3]:
            if not isinstance(item, dict) or not item.get("description"):
                continue
            cat = item.get("category", "general")
            if cat not in valid_cats:
                cat = "general"
            self.add_goal(
                description=item["description"],
                priority=max(1, min(10, int(item.get("priority", 5)))),
                category=cat,
            )
            added += 1

        log.info("%d nouveaux objectifs générés automatiquement", added)
        self._last_generated = time.time()
        return added

    def _get_recent_errors(self) -> str:
        """Lit les dernières lignes du log pour trouver des erreurs récentes."""
        log_dir = Path.home() / ".chimera" / "logs"
        log_files = list(log_dir.glob("*.log")) if log_dir.exists() else []
        if not log_files:
            return "aucune"
        try:
            # Chercher dans le log le plus récent
            latest = max(log_files, key=lambda p: p.stat().st_mtime)
            lines = latest.read_text(errors="replace").splitlines()
            errors = [l for l in lines[-200:] if "error" in l.lower() or "erreur" in l.lower()]
            return "; ".join(errors[-3:]) if errors else "aucune"
        except Exception:
            return "aucune"

    async def execute(self, goal: Goal) -> str:
        """Marque l'objectif comme actif. Tente de soumettre à l'orchestrator."""
        goal.status = GoalStatus.ACTIVE.value
        goal.executed_at = datetime.now().isoformat()
        self._update_goal(goal)

        orchestrator_url = os.environ.get(
            "AGENT_ORCHESTRATION_URL", "http://localhost:8001"
        )
        try:
            async with httpx.AsyncClient(timeout=10.0) as c:
                resp = await c.post(
                    f"{orchestrator_url}/task",
                    json={
                        "task": goal.description,
                        "priority": goal.priority,
                        "source": "goals_loop",
                        "goal_id": goal.id,
                    },
                )
            if resp.status_code < 300:
                data = resp.json()
                mission_id = data.get("id", f"m_{int(time.time()*1000)}")
                goal.mission_id = mission_id
                self._update_goal(goal)
                return f"Mission soumise: {mission_id}"
            return f"Orchestrator erreur HTTP {resp.status_code}"
        except Exception as exc:
            log.warning("execute_orchestrator_unavailable: %s", exc)
            return f"ERREUR soumission orchestrator: {exc}"

    async def learn(self, goal: Goal, result: str) -> None:
        """Met à jour la base après exécution et génère un insight."""
        success = not result.startswith("ERREUR")
        goal.status = GoalStatus.DONE.value if success else GoalStatus.FAILED.value
        goal.result = result[:500]

        insight = await self._generate_insight(goal, result)
        goal.learned = insight
        self._update_goal(goal)

        stats = self.get_stats()
        rate = stats["success_rate"]
        rate_str = f"{rate}%" if (stats["done"] + stats["failed"]) > 0 else "N/A"
        log.info(
            "goal_%s: %s | taux succès %s",
            "done" if success else "failed",
            goal.id,
            rate_str,
        )

    async def _generate_insight(self, goal: Goal, result: str) -> str:
        """Génère un insight court sur le résultat via Ollama."""
        prompt = (
            f"Objectif '{goal.description}' résultat: '{result[:200]}'. "
            "En 1 phrase: qu'est-ce qu'on apprend de ceci pour l'avenir?"
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as c:
                resp = await c.post(
                    f"{OLLAMA}/api/chat",
                    json={
                        "model": MODEL_GENERAL,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False,
                        "options": {"temperature": 0.3, "num_predict": 100},
                    },
                )
            return resp.json().get("message", {}).get("content", "").strip()[:300]
        except Exception:
            return ""

    async def run(self) -> None:
        """Boucle principale : toutes les 30 min, exécute le prochain objectif."""
        log.info("goals_loop_started")
        await self.generate_goals()

        while True:
            try:
                # Génération automatique toutes les 6h
                if time.time() - self._last_generated >= GENERATE_INTERVAL_SEC:
                    await self.generate_goals()

                goal = await self.pick_next()
                if goal:
                    log.info("executing_goal: [%s] %s", goal.id, goal.description[:70])
                    result = await self.execute(goal)
                    await self.learn(goal, result)
                else:
                    log.info("no_pending_goals — attente...")

                stats = self.get_stats()
                log.info(
                    "goals_stats: done=%d pending=%d success_rate=%s%%",
                    stats["done"],
                    stats["pending"],
                    stats["success_rate"],
                )

            except Exception as exc:
                log.error("goals_loop_error: %s", exc)

            await asyncio.sleep(LOOP_INTERVAL_SEC)


# ─── Singleton ────────────────────────────────────────────────────────────────

_goals_loop: GoalsLoop | None = None


def get_goals_loop() -> GoalsLoop:
    global _goals_loop
    if _goals_loop is None:
        _goals_loop = GoalsLoop()
    return _goals_loop


# ─── Lifespan (boucle background) ────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Démarre la boucle d'objectifs en background au démarrage de l'agent."""
    loop = get_goals_loop()
    task = asyncio.create_task(loop.run())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Goals Agent",
    description="Boucle d'objectifs autonomes — génère, priorise et exécute ses propres objectifs",
    version="1.0.0",
    lifespan=lifespan,
)


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    """Liveness check — utilisé par la Queen HealthMonitor."""
    loop = get_goals_loop()
    stats = loop.get_stats()
    return {
        "status": "ok",
        "service": "goals",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "goals_pending": stats["pending"],
        "goals_done": stats["done"],
    }


@app.get("/goals", response_model=list[GoalOut])
async def list_goals() -> list[GoalOut]:
    """Retourne la liste des objectifs actifs et en attente."""
    loop = get_goals_loop()
    goals = loop.list_goals()
    return [
        GoalOut(
            id=g.id,
            description=g.description,
            priority=g.priority,
            category=g.category,
            status=g.status,
            created_at=g.created_at,
            executed_at=g.executed_at,
            result=g.result,
            learned=g.learned,
        )
        for g in goals
    ]


@app.post("/goals", response_model=GoalOut)
async def add_goal(req: AddGoalRequest) -> GoalOut:
    """Ajoute un objectif manuellement."""
    if not req.description.strip():
        raise HTTPException(status_code=422, detail="description ne peut pas être vide")

    loop = get_goals_loop()
    gid = loop.add_goal(
        description=req.description,
        priority=req.priority,
        category=req.category,
    )

    # Retourner l'objectif créé
    goals = [g for g in loop.list_goals() if g.id == gid]
    if not goals:
        raise HTTPException(status_code=500, detail="Objectif créé mais introuvable")

    g = goals[0]
    return GoalOut(
        id=g.id,
        description=g.description,
        priority=g.priority,
        category=g.category,
        status=g.status,
        created_at=g.created_at,
    )


@app.get("/status")
async def get_status() -> dict:
    """Statistiques complètes d'exécution."""
    loop = get_goals_loop()
    stats = loop.get_stats()
    return {
        "service": "goals",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "db_path": str(GOALS_DB),
        "loop_interval_min": LOOP_INTERVAL_SEC // 60,
        "generate_interval_h": GENERATE_INTERVAL_SEC // 3600,
        "stats": stats,
    }
