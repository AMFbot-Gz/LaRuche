"""
schemas/memory_schemas.py — Pydantic models for the Memory Agent API.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ─── Request models ───────────────────────────────────────────────────────────


class SaveMemoryRequest(BaseModel):
    """
    Store an experience in long-term memory.

    Example:
        {
          "task": "generate python function to sort a list",
          "result": {"success": true, "code": "def sort_list(l): return sorted(l)"},
          "success": true,
          "context": "user requested ascending sort"
        }
    """

    task: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        description="Natural language description of the task that was executed",
    )
    result: dict[str, Any] = Field(
        default_factory=dict,
        description="Dict describing the outcome — must include a 'success' key",
    )
    plan: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional execution plan (steps, strategy…)",
    )
    success: bool = Field(
        default=True,
        description="Top-level success flag (used if result.success is absent)",
    )
    context: str = Field(
        default="",
        max_length=500,
        description="Optional context string stored as screen_after (for search scoring)",
    )


class SearchQuery(BaseModel):
    """Query long-term memory with semantic search."""

    query: str = Field(..., min_length=3, max_length=500)
    n_results: int = Field(default=5, ge=1, le=20)
    failures_only: bool = Field(
        default=False,
        description="If True, only return experiences that failed",
    )


# ─── Response models ──────────────────────────────────────────────────────────


class SaveMemoryResponse(BaseModel):
    memory_id: str
    stored: bool
    total_memories: int
    message: str = ""


class MemoryHit(BaseModel):
    id: str
    task_short: str
    similarity: float
    success: bool
    days_old: int
    screen_after: str = ""


class SearchResponse(BaseModel):
    query: str
    results: list[MemoryHit]
    count: int
    context_block: str = Field(
        default="",
        description="Pre-formatted context block ready to inject into an LLM prompt",
    )


class MemoryStatus(BaseModel):
    status: str
    service: str = "memory"
    total_experiences: int
    tasks_success: int
    tasks_failed: int
    uptime_seconds: int
    chromadb_available: bool
    embeddings_available: bool
    timestamp: str
