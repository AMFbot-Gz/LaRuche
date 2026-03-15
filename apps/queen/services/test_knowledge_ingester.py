"""
test_knowledge_ingester.py — Unit tests for knowledge_ingester.py

Coverage:
  - chunk_text: empty, single chunk, multi-chunk, overlap behavior
  - ingest_file: real tmp files, unsupported ext, too large, success path
  - ingest_directory: real tmp tree, max_files cap, extension filter
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from apps.queen.services.knowledge_ingester import (
    chunk_text,
    ingest_directory,
    ingest_file,
)


# ─── chunk_text tests ─────────────────────────────────────────────────────────


def test_chunk_text_empty() -> None:
    assert chunk_text("") == []


def test_chunk_text_short_stays_one_chunk() -> None:
    text = "hello world this is a short text"
    chunks = chunk_text(text, chunk_size=500)
    assert len(chunks) == 1
    assert chunks[0] == text


def test_chunk_text_exact_chunk_size() -> None:
    text = " ".join(str(i) for i in range(500))
    chunks = chunk_text(text, chunk_size=500, overlap=0)
    assert len(chunks) == 1


def test_chunk_text_multi_chunk() -> None:
    # 600 words, chunk=500, overlap=50 → step=450 → 2 chunks
    words = [str(i) for i in range(600)]
    text = " ".join(words)
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    assert len(chunks) == 2


def test_chunk_text_overlap() -> None:
    # Words 0-499 in chunk 0, words 450-599 in chunk 1
    words = [str(i) for i in range(600)]
    text = " ".join(words)
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    first_last = chunks[0].split()[-1]   # word 499
    second_first = chunks[1].split()[0]  # word 450 (step = 500-50 = 450)
    assert int(second_first) == 450


def test_chunk_text_all_words_covered() -> None:
    words = [str(i) for i in range(750)]
    text = " ".join(words)
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    # Last chunk must end at word 749
    last_word = chunks[-1].split()[-1]
    assert last_word == "749"


# ─── ingest_file tests ────────────────────────────────────────────────────────


def test_ingest_file_not_found() -> None:
    result = ingest_file("/nonexistent/path/file.py")
    assert result["success"] is False
    assert "not found" in result["error"]


def test_ingest_file_unsupported_extension(tmp_path: Path) -> None:
    f = tmp_path / "image.png"
    f.write_bytes(b"\x89PNG")
    result = ingest_file(f)
    assert result["success"] is False
    assert "unsupported" in result["error"]


def test_ingest_file_empty_file(tmp_path: Path) -> None:
    f = tmp_path / "empty.py"
    f.write_text("")
    # Empty file → no chunks → success=True, chunks_sent=0
    with patch("apps.queen.services.knowledge_ingester.requests.post") as mock_post:
        result = ingest_file(f)
    assert result["chunks_sent"] == 0
    assert result["success"] is True
    mock_post.assert_not_called()


def test_ingest_file_success(tmp_path: Path) -> None:
    f = tmp_path / "main.py"
    f.write_text("def hello():\n    return 'world'\n" * 10)

    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch(
        "apps.queen.services.knowledge_ingester.requests.post", return_value=mock_resp
    ) as mock_post:
        result = ingest_file(f)

    assert result["success"] is True
    assert result["chunks_sent"] >= 1
    mock_post.assert_called()


def test_ingest_file_too_large(tmp_path: Path) -> None:
    f = tmp_path / "big.md"
    # Write > 1MB
    f.write_text("word " * 300_000)
    result = ingest_file(f)
    assert result["success"] is False
    assert "too large" in result["error"]


# ─── ingest_directory tests ───────────────────────────────────────────────────


@pytest.fixture
def code_dir(tmp_path: Path) -> Path:
    """Fake project with some .py, .md, a hidden dir, and node_modules."""
    (tmp_path / "app.py").write_text("print('hello')" * 5)
    (tmp_path / "README.md").write_text("# Project\n\nSome docs.")
    (tmp_path / "data.bin").write_bytes(b"\x00\x01")       # unsupported
    (tmp_path / ".hidden").mkdir()
    (tmp_path / ".hidden" / "secret.py").write_text("x=1")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "dep.js").write_text("module.exports={}")
    return tmp_path


def test_ingest_directory_nonexistent() -> None:
    result = ingest_directory("/nonexistent/path")
    assert result["files_processed"] == 0
    assert "not found" in result["errors"][0]


def test_ingest_directory_basic(code_dir: Path) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("apps.queen.services.knowledge_ingester.requests.post", return_value=mock_resp):
        result = ingest_directory(code_dir)

    # Should process app.py and README.md — NOT hidden or node_modules
    assert result["files_processed"] == 2
    assert result["chunks_sent"] >= 2


def test_ingest_directory_max_files(code_dir: Path) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("apps.queen.services.knowledge_ingester.requests.post", return_value=mock_resp):
        result = ingest_directory(code_dir, max_files=1)

    assert result["files_processed"] <= 1


def test_ingest_directory_extension_filter(code_dir: Path) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("apps.queen.services.knowledge_ingester.requests.post", return_value=mock_resp):
        result = ingest_directory(code_dir, extensions=[".py"])

    assert result["files_processed"] == 1  # only app.py
