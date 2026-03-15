"""
librarian_service.py — External knowledge retrieval for the Librarian Agent.

Sources:
  1. StackExchange API v2.3  — questions / answers (no scraping, official API)
  2. GitHub REST API          — repository + code search

Rate limiting:
  - StackExchange: 300 req/day unauthenticated; 10,000/day with key
  - GitHub: 10 req/min unauthenticated; 30 req/min with token

Results are pushed to Memory Agent (/memories) for future RAG retrieval.
"""

from __future__ import annotations

import os
import time
from urllib.parse import urlencode

import requests

from agents.knowledge.schemas.librarian_schemas import (
    GithubResult,
    SearchSummary,
    StackResult,
)

# ─── Configuration ────────────────────────────────────────────────────────────

_STACK_BASE   = "https://api.stackexchange.com/2.3"
_GITHUB_BASE  = "https://api.github.com"
_MEMORY_URL   = os.getenv("AGENT_MEMORY_URL", "http://localhost:8006")

# Optional API keys from environment
_STACK_KEY    = os.getenv("STACKEXCHANGE_KEY", "")
_GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

_REQUEST_TIMEOUT = 10  # seconds per external call
_MEMORY_TIMEOUT  = 5


# ─── LibrarianService ─────────────────────────────────────────────────────────


class LibrarianService:
    """Searches external knowledge sources and stores results in Memory."""

    def search_stackoverflow(
        self,
        query: str,
        tags: list[str] | None = None,
        max_results: int = 5,
    ) -> list[StackResult]:
        """
        Search StackOverflow via StackExchange API v2.3.

        Uses the /search/advanced endpoint with intitle + tagged filters.
        Sorted by votes. Returns up to max_results questions.
        """
        params: dict = {
            "order":    "desc",
            "sort":     "votes",
            "intitle":  query,
            "site":     "stackoverflow",
            "pagesize": max_results,
            "filter":   "withbody",  # include body snippet
        }
        if tags:
            params["tagged"] = ";".join(tags)
        if _STACK_KEY:
            params["key"] = _STACK_KEY

        url = f"{_STACK_BASE}/search/advanced?{urlencode(params)}"

        try:
            resp = requests.get(url, timeout=_REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []

        results: list[StackResult] = []
        for item in data.get("items", []):
            # Strip HTML from body for clean excerpt
            body_raw = item.get("body", "")
            excerpt  = self._strip_html(body_raw)[:300]

            results.append(StackResult(
                question_id       = item.get("question_id", 0),
                title             = item.get("title", ""),
                link              = item.get("link", ""),
                score             = item.get("score", 0),
                is_answered       = item.get("is_answered", False),
                answer_count      = item.get("answer_count", 0),
                tags              = item.get("tags", []),
                accepted_answer_id = item.get("accepted_answer_id"),
                excerpt           = excerpt,
            ))

        return results

    def search_github(
        self,
        query: str,
        language: str = "",
        max_results: int = 5,
    ) -> list[GithubResult]:
        """
        Search GitHub repositories via REST API.

        Sorted by stars descending. Optionally filtered by language.
        """
        q = query
        if language:
            q += f" language:{language}"

        params = {
            "q":        q,
            "sort":     "stars",
            "order":    "desc",
            "per_page": max_results,
        }
        url = f"{_GITHUB_BASE}/search/repositories?{urlencode(params)}"

        headers = {"Accept": "application/vnd.github.v3+json"}
        if _GITHUB_TOKEN:
            headers["Authorization"] = f"Bearer {_GITHUB_TOKEN}"

        try:
            resp = requests.get(url, headers=headers, timeout=_REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return []

        results: list[GithubResult] = []
        for item in data.get("items", []):
            results.append(GithubResult(
                full_name   = item.get("full_name", ""),
                html_url    = item.get("html_url", ""),
                description = item.get("description") or "",
                stars       = item.get("stargazers_count", 0),
                language    = item.get("language") or "",
                topics      = item.get("topics", []),
                updated_at  = item.get("updated_at", ""),
                result_type = "repository",
            ))

        return results

    def search(
        self,
        query: str,
        sources: list[str] | None = None,
        tags: list[str] | None = None,
        language: str = "",
        max_results: int = 5,
    ) -> SearchSummary:
        """
        Unified search across configured sources.

        Stores results to Memory Agent for future RAG retrieval.
        """
        sources = sources or ["stackoverflow", "github"]
        t0 = time.time()

        so_results: list[StackResult] = []
        gh_results: list[GithubResult] = []

        if "stackoverflow" in sources:
            so_results = self.search_stackoverflow(query, tags=tags, max_results=max_results)

        if "github" in sources:
            gh_results = self.search_github(query, language=language, max_results=max_results)

        total = len(so_results) + len(gh_results)
        stored = False

        if total > 0:
            stored = self._store_to_memory(query, so_results, gh_results)

        return SearchSummary(
            query           = query,
            stackoverflow   = so_results,
            github          = gh_results,
            total_results   = total,
            stored_to_memory = stored,
            duration_ms     = int((time.time() - t0) * 1000),
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _strip_html(self, html: str) -> str:
        """Remove HTML tags from a string (simple regex-free approach)."""
        import html as html_module
        import re
        text = re.sub(r"<[^>]+>", " ", html)
        text = html_module.unescape(text)
        return " ".join(text.split())

    def _store_to_memory(
        self,
        query: str,
        so_results: list[StackResult],
        gh_results: list[GithubResult],
    ) -> bool:
        """
        Store a text summary of search results in Memory Agent.

        This makes the external knowledge retrievable via RAG.
        """
        lines = [f"External knowledge search: {query}", ""]

        if so_results:
            lines.append("StackOverflow results:")
            for r in so_results[:3]:
                lines.append(f"  - [{r.score}★] {r.title} — {r.link}")
                if r.excerpt:
                    lines.append(f"    {r.excerpt[:150]}")

        if gh_results:
            lines.append("GitHub repositories:")
            for r in gh_results[:3]:
                lines.append(f"  - {r.full_name} ({r.stars}★) — {r.description[:100]}")

        context = "\n".join(lines)

        try:
            resp = requests.post(
                f"{_MEMORY_URL}/memories",
                json={
                    "task":    f"external_search: {query}",
                    "result":  {
                        "so_count": len(so_results),
                        "gh_count": len(gh_results),
                    },
                    "plan":    {},
                    "success": True,
                    "context": context,
                },
                timeout=_MEMORY_TIMEOUT,
            )
            return resp.status_code == 200
        except Exception:
            return False
