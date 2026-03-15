"""
librarian_agent.py — FastAPI app for the Librarian Agent (:8009)

Searches external knowledge sources (StackOverflow, GitHub) and stores
results in Memory Agent for future RAG retrieval.

Endpoints:
  GET  /health                  — liveness check
  POST /search/stackoverflow    — search StackExchange only
  POST /search/github           — search GitHub only
  POST /search                  — unified search (both sources)

Launch:
  uvicorn agents.knowledge.librarian_agent:app --port 8009 --reload
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI

from agents.knowledge.schemas.librarian_schemas import (
    GithubResult,
    SearchRequest,
    SearchSummary,
    StackResult,
)
from agents.knowledge.services.librarian_service import LibrarianService

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Librarian Agent",
    description="External knowledge retrieval: StackOverflow + GitHub → Memory RAG.",
    version="1.0.0",
)

_librarian = LibrarianService()


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    """Liveness probe — used by Queen HealthMonitor."""
    return {
        "status":    "ok",
        "service":   "knowledge",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/search/stackoverflow", response_model=list[StackResult])
async def search_stackoverflow(req: SearchRequest) -> list[StackResult]:
    """
    Search StackOverflow via StackExchange API v2.3.

    Returns up to max_results questions sorted by votes.
    """
    return _librarian.search_stackoverflow(
        query=req.query,
        tags=req.tags or None,
        max_results=req.max_results,
    )


@app.post("/search/github", response_model=list[GithubResult])
async def search_github(req: SearchRequest) -> list[GithubResult]:
    """
    Search GitHub repositories sorted by stars.

    Optionally filtered by programming language.
    """
    return _librarian.search_github(
        query=req.query,
        language=req.language,
        max_results=req.max_results,
    )


@app.post("/search", response_model=SearchSummary)
async def unified_search(req: SearchRequest) -> SearchSummary:
    """
    Unified search across all configured sources.

    Results are automatically stored in Memory Agent for RAG retrieval.
    """
    return _librarian.search(
        query=req.query,
        sources=req.sources,
        tags=req.tags or None,
        language=req.language,
        max_results=req.max_results,
    )


# ─── Direct launch ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agents.knowledge.librarian_agent:app", host="0.0.0.0", port=8009, reload=True)
