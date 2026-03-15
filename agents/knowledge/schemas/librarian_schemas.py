"""
librarian_schemas.py — Pydantic schemas for the Librarian Agent.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class StackResult(BaseModel):
    """A single StackExchange answer/question."""

    question_id: int
    title: str
    link: str
    score: int
    is_answered: bool
    answer_count: int
    tags: list[str] = Field(default_factory=list)
    accepted_answer_id: int | None = None
    excerpt: str = ""  # body snippet, if available


class GithubResult(BaseModel):
    """A single GitHub repository or code result."""

    full_name: str
    html_url: str
    description: str = ""
    stars: int = 0
    language: str = ""
    topics: list[str] = Field(default_factory=list)
    updated_at: str = ""
    result_type: str = "repository"  # "repository" | "code"


class SearchRequest(BaseModel):
    """Unified search request for both sources."""

    query: str = Field(..., min_length=3, max_length=500)
    sources: list[str] = Field(
        default_factory=lambda: ["stackoverflow", "github"],
        description="Which sources to search: 'stackoverflow', 'github'",
    )
    max_results: int = Field(default=5, ge=1, le=20)
    tags: list[str] = Field(
        default_factory=list,
        description="StackOverflow tags to filter by (e.g. ['python', 'fastapi'])",
    )
    language: str = Field(
        default="",
        description="GitHub language filter (e.g. 'python')",
    )


class SearchSummary(BaseModel):
    """Combined search results from all sources."""

    query: str
    stackoverflow: list[StackResult] = Field(default_factory=list)
    github: list[GithubResult] = Field(default_factory=list)
    total_results: int = 0
    stored_to_memory: bool = False
    duration_ms: int = 0
    error: str = ""
