"""
orchestration_agent.py — FastAPI app de l'Orchestration Agent (:8001)

L'Orchestration Agent est le coordinateur de Chimera :
  1. Reçoit une mission haut-niveau (/orchestrate)
  2. La décompose en étapes via MissionPlanner (Brain /think)
  3. Dispatche chaque étape aux agents spécialisés (AgentDispatcher)
  4. Retourne un résultat consolidé avec résumé

Endpoints :
  GET  /health         — liveness check
  GET  /status         — état détaillé des agents + missions
  POST /orchestrate    — orchestrer une mission complète
  POST /delegate       — déléguer une tâche atomique à un agent
  POST /react          — exécuter un goal via le loop ReAct (Reason-Act-Observe)
  GET  /missions       — liste missions en cours / terminées
  GET  /missions/{id}  — détail d'une mission

Lancement :
  uvicorn agents.orchestration.orchestration_agent:app --port 8001 --reload
"""

from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException

from agents.orchestration.schemas.orchestration_schemas import (
    DelegateRequest,
    DelegateResponse,
    MissionRecord,
    MissionStep,
    OrchestrateRequest,
    OrchestrateResponse,
)
from agents.orchestration.services.agent_dispatcher import AgentDispatcher
from agents.orchestration.services.mission_planner import MissionPlanner
from agents.orchestration.services.react_planner import AVAILABLE_SKILLS, ReActPlanner

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Orchestration Agent",
    description="Coordinateur de missions — décompose et dispatche vers les agents spécialisés",
    version="1.0.0",
)

# Singletons
_dispatcher = AgentDispatcher()
_planner    = MissionPlanner()

# Store in-memory des missions (pas de DB)
# clé = mission_id, valeur = MissionRecord
_missions: dict[str, MissionRecord] = {}


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """
    Liveness check — utilisé par la Queen HealthMonitor.
    Retourne la liste des agents disponibles et le nombre de missions en cours.
    """
    running = sum(1 for m in _missions.values() if m.status == "running")
    return {
        "status":            "ok",
        "service":           "orchestration",
        "timestamp":         datetime.now(timezone.utc).isoformat(),
        "available_agents":  list(_dispatcher.AGENT_URLS.keys()),
        "missions_running":  running,
    }


@app.get("/status")
async def status():
    """
    État détaillé : agents connectés (health checks en parallèle) + missions actives.
    """
    agents_health = await _dispatcher.check_health()

    missions_summary = [
        {
            "mission_id":  m.mission_id,
            "objective":   m.objective,
            "status":      m.status,
            "started_at":  m.started_at,
            "finished_at": m.finished_at,
            "steps_total": len(m.steps),
            "steps_done":  sum(1 for s in m.steps if s.status == "done"),
        }
        for m in _missions.values()
    ]

    return {
        "status":          "ok",
        "service":         "orchestration",
        "timestamp":       datetime.now(timezone.utc).isoformat(),
        "agents":          agents_health,
        "agents_online":   sum(agents_health.values()),
        "agents_total":    len(agents_health),
        "missions":        missions_summary,
        "missions_total":  len(_missions),
        "missions_running": sum(1 for m in _missions.values() if m.status == "running"),
    }


@app.post("/orchestrate", response_model=OrchestrateResponse)
async def orchestrate(req: OrchestrateRequest) -> OrchestrateResponse:
    """
    Orchestrer une mission haut-niveau.

    Pipeline :
      1. Planification : décompose l'objectif en étapes (Brain /think)
      2. Exécution    : dispatche chaque étape séquentiellement
      3. Résumé       : consolide les résultats

    Le timeout global est respecté via asyncio.wait_for.
    """
    mission_id = str(uuid.uuid4())
    t0         = time.monotonic()
    started_at = datetime.now(timezone.utc).isoformat()

    # Enregistrement initial
    record = MissionRecord(
        mission_id = mission_id,
        objective  = req.objective,
        status     = "running",
        started_at = started_at,
    )
    _missions[mission_id] = record

    try:
        result = await asyncio.wait_for(
            _execute_mission(record, req),
            timeout=req.timeout,
        )
    except asyncio.TimeoutError:
        duration_ms = int((time.monotonic() - t0) * 1000)
        # Marquer les étapes pending/running comme failed
        for step in record.steps:
            if step.status in ("pending", "running"):
                step.status = "failed"
                step.error  = "Timeout global atteint"
        record.status      = "failed"
        record.summary     = f"Mission interrompue après timeout de {req.timeout}s"
        record.finished_at = datetime.now(timezone.utc).isoformat()
        record.duration_ms = duration_ms
        result = OrchestrateResponse(
            mission_id  = mission_id,
            objective   = req.objective,
            status      = "failed",
            steps       = record.steps,
            summary     = record.summary,
            duration_ms = duration_ms,
        )

    return result


@app.post("/delegate", response_model=DelegateResponse)
async def delegate(req: DelegateRequest) -> DelegateResponse:
    """
    Déléguer une tâche atomique à un agent spécifique.

    Ne lève jamais de 503 : si l'agent est indisponible, retourne success=False.
    """
    t0 = time.monotonic()

    dispatch_result = await _dispatcher.dispatch(
        agent    = req.agent,
        endpoint = req.endpoint,
        payload  = req.payload,
        timeout  = req.timeout,
    )

    duration_ms = dispatch_result.get("duration_ms", int((time.monotonic() - t0) * 1000))

    return DelegateResponse(
        success     = dispatch_result["success"],
        agent       = req.agent,
        endpoint    = req.endpoint,
        data        = dispatch_result.get("data", {}),
        duration_ms = duration_ms,
        error       = dispatch_result.get("error"),
    )


@app.get("/missions")
async def list_missions():
    """
    Liste toutes les missions en cours et terminées (store in-memory).
    """
    return {
        "missions": [
            {
                "mission_id":   m.mission_id,
                "objective":    m.objective,
                "status":       m.status,
                "started_at":   m.started_at,
                "finished_at":  m.finished_at,
                "steps_total":  len(m.steps),
                "steps_done":   sum(1 for s in m.steps if s.status == "done"),
                "steps_failed": sum(1 for s in m.steps if s.status == "failed"),
                "duration_ms":  m.duration_ms,
            }
            for m in _missions.values()
        ],
        "total": len(_missions),
    }


@app.get("/missions/{mission_id}")
async def get_mission(mission_id: str):
    """
    Détail complet d'une mission par son ID.
    Retourne 404 si la mission est inconnue.
    """
    record = _missions.get(mission_id)
    if record is None:
        raise HTTPException(
            status_code=404,
            detail=f"Mission '{mission_id}' introuvable",
        )

    return record.model_dump()


# ─── Helpers internes ─────────────────────────────────────────────────────────


async def _execute_mission(
    record: MissionRecord,
    req: OrchestrateRequest,
) -> OrchestrateResponse:
    """
    Exécute les étapes d'une mission et met à jour le record in-memory.

    Exécution séquentielle : chaque étape attend la précédente.
    En cas d'échec d'une étape, les suivantes sont marquées pending mais tentées.
    """
    t0 = time.monotonic()

    # ── 1. Planification ──────────────────────────────────────────────────────
    steps = await _planner.plan(req.objective, req.context)
    record.steps = steps

    # ── 2. Exécution des étapes ───────────────────────────────────────────────
    failed_count  = 0
    success_count = 0

    for step in record.steps:
        step.status = "running"
        step_t0     = time.monotonic()

        result = await _dispatcher.dispatch(
            agent    = step.agent,
            endpoint = step.endpoint,
            payload  = step.payload,
            timeout  = min(30, req.timeout),
        )

        step.duration_ms = result.get("duration_ms", int((time.monotonic() - step_t0) * 1000))

        if result["success"]:
            step.status = "done"
            step.result = result["data"]
            success_count += 1
        else:
            step.status = "failed"
            step.error  = result.get("error", "Erreur inconnue")
            failed_count += 1

    # ── 3. Calcul du statut global ────────────────────────────────────────────
    total        = len(record.steps)
    duration_ms  = int((time.monotonic() - t0) * 1000)

    if total == 0:
        mission_status = "failed"
        summary        = "Aucune étape planifiée pour cet objectif."
    elif failed_count == 0:
        mission_status = "completed"
        summary        = (
            f"Mission accomplie en {duration_ms}ms. "
            f"{success_count} étape(s) exécutée(s) avec succès."
        )
    elif success_count == 0:
        mission_status = "failed"
        summary        = (
            f"Mission échouée. {failed_count} étape(s) en erreur sur {total}."
        )
    else:
        mission_status = "partial"
        summary        = (
            f"Mission partiellement accomplie. "
            f"{success_count}/{total} étapes réussies, {failed_count} en échec."
        )

    # ── 4. Mise à jour du record ───────────────────────────────────────────────
    record.status      = mission_status
    record.summary     = summary
    record.finished_at = datetime.now(timezone.utc).isoformat()
    record.duration_ms = duration_ms

    return OrchestrateResponse(
        mission_id  = record.mission_id,
        objective   = req.objective,
        status      = mission_status,
        steps       = record.steps,
        summary     = summary,
        duration_ms = duration_ms,
    )


# ─── Lancement direct ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "agents.orchestration.orchestration_agent:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
    )
