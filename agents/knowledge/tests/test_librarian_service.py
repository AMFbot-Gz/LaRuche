"""
test_librarian_service.py — Unit tests for LibrarianService.

Coverage:
  - search_stackoverflow: mocked HTTP, parses response, handles errors
  - search_github: mocked HTTP, parses response, handles errors
  - search: unified results, calls both sources, calls _store_to_memory
  - _strip_html: removes HTML tags, unescapes entities
  - _store_to_memory: mocked Memory call, returns bool
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from agents.knowledge.schemas.librarian_schemas import (
    GithubResult,
    SearchRequest,
    SearchSummary,
    StackResult,
)
from agents.knowledge.services.librarian_service import LibrarianService


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def svc() -> LibrarianService:
    return LibrarianService()


# ─── Mock data ────────────────────────────────────────────────────────────────


MOCK_SO_RESPONSE = {
    "items": [
        {
            "question_id": 12345,
            "title": "How to use FastAPI with async?",
            "link": "https://stackoverflow.com/q/12345",
            "score": 42,
            "is_answered": True,
            "answer_count": 3,
            "tags": ["python", "fastapi"],
            "accepted_answer_id": 67890,
            "body": "<p>You can use <code>async def</code> in FastAPI routes.</p>",
        }
    ]
}

MOCK_GH_RESPONSE = {
    "items": [
        {
            "full_name": "tiangolo/fastapi",
            "html_url": "https://github.com/tiangolo/fastapi",
            "description": "FastAPI framework, high performance, easy to learn",
            "stargazers_count": 75000,
            "language": "Python",
            "topics": ["python", "api", "fastapi"],
            "updated_at": "2024-01-15T10:00:00Z",
        }
    ]
}


# ─── search_stackoverflow tests ───────────────────────────────────────────────


def test_search_stackoverflow_parses_response(svc: LibrarianService) -> None:
    """Correctly parses StackExchange API response."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = MOCK_SO_RESPONSE

    with patch("agents.knowledge.services.librarian_service.requests.get", return_value=mock_resp):
        results = svc.search_stackoverflow("fastapi async")

    assert len(results) == 1
    r = results[0]
    assert r.question_id == 12345
    assert r.title == "How to use FastAPI with async?"
    assert r.score == 42
    assert r.is_answered is True
    assert "python" in r.tags
    assert r.accepted_answer_id == 67890


def test_search_stackoverflow_strips_html(svc: LibrarianService) -> None:
    """HTML tags are removed from excerpt."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = MOCK_SO_RESPONSE

    with patch("agents.knowledge.services.librarian_service.requests.get", return_value=mock_resp):
        results = svc.search_stackoverflow("fastapi async")

    assert "<p>" not in results[0].excerpt
    assert "<code>" not in results[0].excerpt


def test_search_stackoverflow_handles_error(svc: LibrarianService) -> None:
    """Network errors return empty list, not exception."""
    with patch(
        "agents.knowledge.services.librarian_service.requests.get",
        side_effect=ConnectionError("timeout"),
    ):
        results = svc.search_stackoverflow("error query")

    assert results == []


# ─── search_github tests ──────────────────────────────────────────────────────


def test_search_github_parses_response(svc: LibrarianService) -> None:
    """Correctly parses GitHub API response."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = MOCK_GH_RESPONSE

    with patch("agents.knowledge.services.librarian_service.requests.get", return_value=mock_resp):
        results = svc.search_github("fastapi")

    assert len(results) == 1
    r = results[0]
    assert r.full_name == "tiangolo/fastapi"
    assert r.stars == 75000
    assert r.language == "Python"
    assert r.result_type == "repository"


def test_search_github_language_filter(svc: LibrarianService) -> None:
    """Language filter is appended to the query."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"items": []}

    with patch(
        "agents.knowledge.services.librarian_service.requests.get", return_value=mock_resp
    ) as mock_get:
        svc.search_github("async", language="python")

    call_url = mock_get.call_args[0][0]
    assert "language%3Apython" in call_url or "language:python" in call_url


def test_search_github_handles_error(svc: LibrarianService) -> None:
    """Network errors return empty list, not exception."""
    with patch(
        "agents.knowledge.services.librarian_service.requests.get",
        side_effect=ConnectionError("timeout"),
    ):
        results = svc.search_github("error query")

    assert results == []


# ─── search (unified) tests ───────────────────────────────────────────────────


def test_search_calls_both_sources(svc: LibrarianService) -> None:
    """search() calls both SO and GitHub when sources=['stackoverflow','github']."""
    with (
        patch.object(svc, "search_stackoverflow", return_value=[]) as mock_so,
        patch.object(svc, "search_github", return_value=[]) as mock_gh,
        patch.object(svc, "_store_to_memory", return_value=False),
    ):
        result = svc.search("python asyncio", sources=["stackoverflow", "github"])

    mock_so.assert_called_once()
    mock_gh.assert_called_once()
    assert isinstance(result, SearchSummary)


def test_search_only_stackoverflow(svc: LibrarianService) -> None:
    """sources=['stackoverflow'] skips GitHub."""
    with (
        patch.object(svc, "search_stackoverflow", return_value=[]) as mock_so,
        patch.object(svc, "search_github", return_value=[]) as mock_gh,
        patch.object(svc, "_store_to_memory", return_value=False),
    ):
        svc.search("query", sources=["stackoverflow"])

    mock_so.assert_called_once()
    mock_gh.assert_not_called()


def test_search_stores_to_memory(svc: LibrarianService) -> None:
    """Results with data trigger _store_to_memory."""
    fake_so = [StackResult(
        question_id=1, title="Q", link="http://x", score=5,
        is_answered=True, answer_count=1
    )]
    with (
        patch.object(svc, "search_stackoverflow", return_value=fake_so),
        patch.object(svc, "search_github", return_value=[]),
        patch.object(svc, "_store_to_memory", return_value=True) as mock_store,
    ):
        result = svc.search("python test")

    mock_store.assert_called_once()
    assert result.stored_to_memory is True


# ─── _strip_html tests ────────────────────────────────────────────────────────


def test_strip_html_removes_tags(svc: LibrarianService) -> None:
    assert "<p>" not in svc._strip_html("<p>Hello <b>world</b></p>")
    assert "Hello" in svc._strip_html("<p>Hello <b>world</b></p>")


def test_strip_html_unescapes_entities(svc: LibrarianService) -> None:
    result = svc._strip_html("&lt;code&gt;x &amp; y&lt;/code&gt;")
    assert "&lt;" not in result
    assert "&gt;" not in result
