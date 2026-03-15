"""
knowledge_ingester.py — Ingests local files into the Memory Agent for RAG.

Responsibilities:
  - chunk_text()        : split text into 500-word chunks with 50-word overlap
  - ingest_file()       : read a single file, chunk it, push to Memory Agent
  - ingest_directory()  : walk a directory and ingest all matching files

Called by:
  - websocket_server.js via subprocess when Queen receives "reindex_knowledge" command
  - Can also be called directly from Python agents

Memory Agent endpoint:
  POST http://localhost:8006/memories
  Body: { task, result, plan, success, context }
"""

from __future__ import annotations

import os
from pathlib import Path

import requests

# ─── Configuration ────────────────────────────────────────────────────────────

_MEMORY_URL      = os.getenv("AGENT_MEMORY_URL", "http://localhost:8006")
_MEMORY_TIMEOUT  = 10  # seconds

_CHUNK_SIZE      = 500   # words per chunk
_CHUNK_OVERLAP   = 50    # words of overlap between chunks
_MAX_FILE_SIZE   = 1_000_000  # 1 MB — skip larger files

# Supported text extensions
_TEXT_EXTENSIONS = {
    ".py", ".js", ".ts", ".go", ".rs", ".rb", ".java", ".c", ".cpp",
    ".md", ".txt", ".rst", ".yaml", ".yml", ".toml", ".json", ".xml",
    ".html", ".css", ".sh", ".bash", ".zsh",
}


# ─── Public API ───────────────────────────────────────────────────────────────


def chunk_text(text: str, chunk_size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    """
    Split text into word-based chunks with overlap.

    Args:
        text:       Raw text to chunk.
        chunk_size: Number of words per chunk (default 500).
        overlap:    Number of words shared between consecutive chunks (default 50).

    Returns:
        List of text chunks. Empty list if text is empty.

    Example:
        chunk_text("word " * 600, chunk_size=500, overlap=50)
        → [chunk_0 (words 0–499), chunk_1 (words 450–949), ...]
    """
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    step = max(1, chunk_size - overlap)
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
        i += step
    return chunks


def ingest_file(file_path: str | Path, label: str = "") -> dict:
    """
    Read a single file, chunk it, and push all chunks to Memory Agent.

    Args:
        file_path: Path to the file to ingest.
        label:     Optional label to include in the task description.

    Returns:
        dict with keys: file, chunks_sent, success, error (if any)
    """
    path = Path(file_path)

    if not path.exists() or not path.is_file():
        return {"file": str(path), "chunks_sent": 0, "success": False,
                "error": "file not found"}

    if path.suffix.lower() not in _TEXT_EXTENSIONS:
        return {"file": str(path), "chunks_sent": 0, "success": False,
                "error": f"unsupported extension: {path.suffix}"}

    if path.stat().st_size > _MAX_FILE_SIZE:
        return {"file": str(path), "chunks_sent": 0, "success": False,
                "error": "file too large (>1MB)"}

    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return {"file": str(path), "chunks_sent": 0, "success": False,
                "error": str(e)}

    chunks = chunk_text(text)
    if not chunks:
        return {"file": str(path), "chunks_sent": 0, "success": True}

    task_label = label or path.name
    sent = 0

    for i, chunk in enumerate(chunks):
        try:
            resp = requests.post(
                f"{_MEMORY_URL}/memories",
                json={
                    "task":    f"knowledge:{task_label}:chunk{i}",
                    "result":  {"source": str(path), "chunk_index": i,
                                "total_chunks": len(chunks)},
                    "plan":    {},
                    "success": True,
                    "context": chunk,
                },
                timeout=_MEMORY_TIMEOUT,
            )
            if resp.status_code == 200:
                sent += 1
        except Exception:
            continue  # Best-effort: skip failed chunks

    return {"file": str(path), "chunks_sent": sent, "success": sent > 0}


def ingest_directory(
    directory: str | Path,
    extensions: list[str] | None = None,
    recursive: bool = True,
    max_files: int = 200,
) -> dict:
    """
    Walk a directory and ingest all matching text files.

    Args:
        directory:  Root directory to walk.
        extensions: File extension whitelist. Defaults to _TEXT_EXTENSIONS.
        recursive:  Whether to recurse into subdirectories.
        max_files:  Hard cap on files to process.

    Returns:
        dict with keys: directory, files_processed, chunks_sent, errors
    """
    root = Path(directory).expanduser()
    if not root.exists() or not root.is_dir():
        return {"directory": str(root), "files_processed": 0,
                "chunks_sent": 0, "errors": ["directory not found"]}

    allowed_exts = {e.lower() for e in (extensions or _TEXT_EXTENSIONS)}
    pattern = "**/*" if recursive else "*"

    errors: list[str] = []
    total_chunks = 0
    processed = 0

    for path in root.glob(pattern):
        if processed >= max_files:
            break
        if not path.is_file():
            continue
        if path.suffix.lower() not in allowed_exts:
            continue
        # Skip hidden dirs and common noise directories
        if any(part.startswith(".") for part in path.parts):
            continue
        if any(part in {"node_modules", "__pycache__", ".venv", "venv", "dist", "build"}
               for part in path.parts):
            continue

        result = ingest_file(path)
        if result["success"]:
            total_chunks += result["chunks_sent"]
            processed += 1
        elif result.get("error") and "unsupported extension" not in result["error"]:
            errors.append(f"{path.name}: {result['error']}")

    return {
        "directory":       str(root),
        "files_processed": processed,
        "chunks_sent":     total_chunks,
        "errors":          errors[:20],  # Cap error list
    }
