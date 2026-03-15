"""
brain.py — FastAPI app for the Brain Agent (:8003)

The Brain is Chimera's universal LLM gateway. It:
  1. Analyses every incoming task to build a TaskProfile
  2. Routes to the optimal model (local Ollama or Claude API)
  3. Exposes a stable /think endpoint consumed by all other agents

Endpoints:
  GET  /health    — liveness check (Queen HealthMonitor)
  GET  /models    — list available + registered models
  POST /think     — single-turn prompt → routed LLM → response
  POST /chat      — multi-turn conversation with history

Launch:
  uvicorn agents.brain.brain:app --port 8003 --reload
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException

from agents.brain.schemas.brain_schemas import (
    ChatRequest,
    ChatResponse,
    ModelInfo,
    ModelsResponse,
    ThinkRequest,
    ThinkResponse,
)
from agents.brain.services.model_router_service import MODEL_REGISTRY, ModelRouterService

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Brain Agent",
    description="Intelligent LLM router — auto-selects the best model for each task",
    version="1.0.0",
)

# Singleton — detects available Ollama models at startup
_router = ModelRouterService()


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Liveness check — used by Queen HealthMonitor. Format must stay stable."""
    return {
        "status":           "ok",
        "service":          "brain",
        "timestamp":        datetime.now(timezone.utc).isoformat(),
        "available_models": _router.available_models,
        "routing_mode":     _router.routing_mode,
    }


@app.get("/models", response_model=ModelsResponse)
async def list_models() -> ModelsResponse:
    """
    List all models: which are available (Ollama running + model pulled, or API key set)
    and what is registered in the routing table.
    """
    available, all_info = _router.list_models()
    registry = [
        ModelInfo(
            key            = m["key"],
            ollama_name    = m["ollama_name"],
            api            = m["api"],
            strengths      = m["strengths"],
            max_complexity = m["max_complexity"],
            speed          = m["speed"],
        )
        for m in all_info
    ]
    return ModelsResponse(
        available      = available,
        all_registered = registry,
        routing_mode   = _router.routing_mode,
        total_available = len(available),
    )


@app.post("/think", response_model=ThinkResponse)
async def think(req: ThinkRequest) -> ThinkResponse:
    """
    Single-turn LLM call with intelligent routing.

    The Brain analyses the prompt, selects the optimal model, and returns
    the response. Used by Auto-Coder Bee and any agent needing LLM inference.

    Raises 503 if no LLM is available (Ollama down + no API key).
    """
    t0 = time.monotonic()

    try:
        response, profile = _router.think(
            prompt               = req.prompt,
            task_type            = req.task_type,
            system_prompt        = req.system_prompt,
            preferred_model      = req.preferred_model,
            routing_mode_override = req.routing_mode,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    duration_ms = int((time.monotonic() - t0) * 1000)

    return ThinkResponse(
        response       = response,
        model_used     = profile.selected_model,
        routing_reason = profile.routing_reason,
        duration_ms    = duration_ms,
        task_profile   = profile.to_dict(),
    )


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """
    Multi-turn conversation. The Brain flattens history for Ollama models
    and uses the native messages API for Claude.
    """
    t0 = time.monotonic()

    try:
        response, profile = _router.chat(
            messages      = [m.model_dump() for m in req.messages],
            task_type     = req.task_type,
            system_prompt = req.system_prompt,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    duration_ms = int((time.monotonic() - t0) * 1000)

    return ChatResponse(
        response       = response,
        model_used     = profile.selected_model,
        routing_reason = profile.routing_reason,
        duration_ms    = duration_ms,
    )


# ─── Lancement direct ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agents.brain.brain:app", host="0.0.0.0", port=8003, reload=True)
