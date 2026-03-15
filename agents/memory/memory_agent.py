"""
memory_agent.py — FastAPI app for the Memory Agent (:8006)

Stores and retrieves experiences using three memory layers:
  1. Working Memory  — state.json (last 10 actions)
  2. Episodic Memory — ChromaDB (vector embeddings, semantic search)
  3. Semantic Memory — patterns.json (KMeans-clustered patterns)

Endpoints:
  GET  /health               — liveness check (Queen HealthMonitor)
  GET  /status               — detailed memory stats
  POST /memories             — store an experience
  GET  /memories/search      — semantic similarity search
  POST /memories/compress    — compress experiences older than N days
  GET  /memories/context     — get formatted context block for LLM injection

Launch:
  uvicorn agents.memory.memory_agent:app --port 8006 --reload
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import FastAPI, Query

from agents.memory.memory import AgentMemory
from agents.memory.schemas.memory_schemas import (
    MemoryHit,
    MemoryStatus,
    SaveMemoryRequest,
    SaveMemoryResponse,
    SearchResponse,
)

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Memory Agent",
    description="Long-term semantic memory — ChromaDB + fastembed BAAI/bge-small-en-v1.5",
    version="1.0.0",
)

# Singleton — initialised once at startup (loads embeddings model + ChromaDB)
_memory = AgentMemory()


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Liveness check — used by Queen HealthMonitor. Format must stay stable."""
    return {
        "status":    "ok",
        "service":   "memory",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "experiences": _memory._count_experiences(),
    }


@app.get("/status", response_model=MemoryStatus)
async def status():
    """Detailed stats: ChromaDB health, embeddings, counters, uptime."""
    state = _memory.get_state()
    return MemoryStatus(
        status              = "ok",
        total_experiences   = _memory._count_experiences(),
        tasks_success       = state.get("tasks_success", 0),
        tasks_failed        = state.get("tasks_failed", 0),
        uptime_seconds      = state.get("uptime", 0),
        chromadb_available  = _memory._collection is not None,
        embeddings_available = _memory._encoder is not None,
        timestamp           = datetime.now(timezone.utc).isoformat(),
    )


@app.post("/memories", response_model=SaveMemoryResponse)
async def save_memory(req: SaveMemoryRequest) -> SaveMemoryResponse:
    """
    Store an experience in long-term memory.

    Called automatically by Auto-Coder Bee after every successful code execution.
    Also callable from any agent or external tool.
    """
    # Merge top-level success into result dict
    result_dict = dict(req.result) if req.result else {}
    if "success" not in result_dict:
        result_dict["success"] = req.success

    memory_id = _memory.save_experience(
        task         = req.task,
        plan         = req.plan or {},
        result       = result_dict,
        screen_after = req.context,
    )

    total = _memory._count_experiences()
    return SaveMemoryResponse(
        memory_id     = memory_id,
        stored        = True,
        total_memories = total,
        message       = f"Stored. Total: {total} experiences.",
    )


@app.get("/memories/search", response_model=SearchResponse)
async def search_memories(
    q: str = Query(..., min_length=3, max_length=500, description="Semantic search query"),
    n: int = Query(default=5, ge=1, le=20, description="Max results"),
) -> SearchResponse:
    """
    Semantic similarity search over all stored experiences.
    Returns ranked results + a pre-formatted context block ready for LLM injection.
    """
    raw = _memory._query_chroma(q, n_results=n)
    now_ts = time.time()

    hits: list[MemoryHit] = []
    for r in raw:
        meta     = r.get("metadata", {})
        days_old = int((now_ts - meta.get("timestamp", now_ts)) / 86400)
        hits.append(MemoryHit(
            id          = r.get("id", ""),
            task_short  = meta.get("task_short", ""),
            similarity  = round(r.get("similarity", 0.0), 3),
            success     = bool(meta.get("success", False)),
            days_old    = days_old,
            screen_after = meta.get("screen_after", "")[:200],
        ))

    # Pre-formatted block for direct LLM prompt injection
    context_block = _memory.get_context_for_task(q, n_results=n)

    return SearchResponse(
        query         = q,
        results       = hits,
        count         = len(hits),
        context_block = context_block,
    )


@app.get("/memories/context")
async def get_context(
    task: str = Query(..., min_length=3, max_length=500),
    n: int    = Query(default=5, ge=1, le=10),
) -> dict:
    """
    Returns a context block + patterns for a given task description.
    Designed to be called by the Brain agent before generating a response.
    """
    context  = _memory.get_context_for_task(task, n_results=n)
    patterns = _memory.get_patterns_for_task(task)

    return {
        "context_block": context,
        "patterns":      patterns,
        "has_context":   bool(context),
    }


@app.post("/memories/compress")
async def compress_memories(
    keep_days: int = Query(default=30, ge=7, le=365),
) -> dict:
    """Remove and summarise experiences older than `keep_days` days."""
    removed = _memory.compress_old_memories(keep_days=keep_days)
    return {
        "compressed":     removed,
        "keep_days":      keep_days,
        "remaining":      _memory._count_experiences(),
        "timestamp":      datetime.now(timezone.utc).isoformat(),
    }


# ─── Lancement direct ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agents.memory.memory_agent:app", host="0.0.0.0", port=8006, reload=True)
