"""
prompt_builder.py — Builds augmented prompts using RAG context.

Responsibilities:
  - build_context_block()  : query Memory Agent for relevant context chunks
  - build_prompt()         : assemble final prompt = session + world_model + knowledge + question

The built prompt is passed to Brain Agent (/think) or directly to Ollama.
"""

from __future__ import annotations

import os
from typing import Any

import requests

# ─── Configuration ────────────────────────────────────────────────────────────

_MEMORY_URL     = os.getenv("AGENT_MEMORY_URL", "http://localhost:8006")
_MEMORY_TIMEOUT = 5  # seconds

# Maximum tokens (words) per section to avoid prompt bloat
_MAX_CONTEXT_WORDS  = 800   # from Memory Agent (episodic + knowledge)
_MAX_SESSION_WORDS  = 200   # recent session context
_MAX_WORLD_WORDS    = 200   # world model summary


# ─── Public API ───────────────────────────────────────────────────────────────


def build_context_block(query: str, n_results: int = 5) -> str:
    """
    Query Memory Agent for context relevant to `query`.

    Returns a formatted context block (or empty string if unavailable).
    """
    try:
        resp = requests.get(
            f"{_MEMORY_URL}/memories/context",
            params={"task": query, "n": n_results},
            timeout=_MEMORY_TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("context_block", "")
    except Exception:
        pass
    return ""


def build_prompt(
    question: str,
    session_context: str = "",
    world_model_summary: str = "",
    n_memory_results: int = 5,
    include_instructions: bool = True,
) -> str:
    """
    Assemble an augmented prompt for the LLM.

    Structure:
      [SYSTEM INSTRUCTIONS]
      [WORLD MODEL CONTEXT]     ← from Mapper Agent
      [RELEVANT MEMORY]         ← from Memory Agent (RAG)
      [SESSION CONTEXT]         ← recent conversation / screen state
      [QUESTION]

    Args:
        question:             The user question or task description.
        session_context:      Recent session text (screen, conversation, …).
        world_model_summary:  Short summary from the Mapper Agent.
        n_memory_results:     How many memory chunks to retrieve.
        include_instructions: Whether to prepend system instructions.

    Returns:
        Full augmented prompt string.
    """
    sections: list[str] = []

    # ── 1. System instructions ────────────────────────────────────────────────
    if include_instructions:
        sections.append(
            "You are Chimera, an autonomous AI assistant. "
            "Use the provided context to answer accurately and concisely. "
            "If context is insufficient, say so rather than guessing."
        )

    # ── 2. World model context ────────────────────────────────────────────────
    if world_model_summary:
        summary = _truncate_words(world_model_summary, _MAX_WORLD_WORDS)
        sections.append(f"[ENVIRONMENT]\n{summary}")

    # ── 3. Relevant memory (RAG) ──────────────────────────────────────────────
    context_block = build_context_block(question, n_results=n_memory_results)
    if context_block:
        truncated = _truncate_words(context_block, _MAX_CONTEXT_WORDS)
        sections.append(f"[RELEVANT CONTEXT FROM MEMORY]\n{truncated}")

    # ── 4. Session context ────────────────────────────────────────────────────
    if session_context:
        session = _truncate_words(session_context, _MAX_SESSION_WORDS)
        sections.append(f"[RECENT SESSION]\n{session}")

    # ── 5. Question / task ────────────────────────────────────────────────────
    sections.append(f"[TASK]\n{question}")

    return "\n\n".join(sections)


def build_code_prompt(
    task_description: str,
    language: str = "python",
    session_context: str = "",
    n_memory_results: int = 5,
) -> str:
    """
    Variant of build_prompt() optimised for code generation tasks.

    Adds language-specific instructions and requests structured output.
    """
    instructions = (
        f"You are Chimera, an expert {language} programmer. "
        "Write clean, production-ready code with proper error handling. "
        "Return ONLY the code block — no explanations unless asked. "
        "If you need to explain a design decision, use a brief comment."
    )

    sections: list[str] = [instructions]

    context_block = build_context_block(task_description, n_results=n_memory_results)
    if context_block:
        sections.append(
            f"[RELEVANT PAST SOLUTIONS]\n{_truncate_words(context_block, _MAX_CONTEXT_WORDS)}"
        )

    if session_context:
        sections.append(
            f"[CONTEXT]\n{_truncate_words(session_context, _MAX_SESSION_WORDS)}"
        )

    sections.append(f"[TASK]\n{task_description}")
    return "\n\n".join(sections)


# ─── Internal helpers ─────────────────────────────────────────────────────────


def _truncate_words(text: str, max_words: int) -> str:
    """Truncate text to at most max_words words, appending '…' if truncated."""
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + " …"
