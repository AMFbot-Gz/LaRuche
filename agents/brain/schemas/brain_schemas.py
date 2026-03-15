"""
schemas/brain_schemas.py — Pydantic models for the Brain Agent API.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ─── /think ──────────────────────────────────────────────────────────────────


class ThinkRequest(BaseModel):
    """
    Send a prompt to the Brain; it routes to the optimal model automatically.

    Example:
        {
          "prompt": "Write a Python function that counts files in a directory",
          "task_type": "code"
        }
    """

    prompt: str = Field(
        ...,
        min_length=1,
        max_length=16_000,
        description="The prompt to send to the LLM",
    )
    task_type: str = Field(
        default="reasoning",
        description="Hint for the router: code | reasoning | vision | web | action",
    )
    system_prompt: str = Field(
        default="",
        max_length=4_000,
        description="Optional system prompt to prepend",
    )
    preferred_model: str = Field(
        default="",
        description="Force a specific model key (overrides auto-routing)",
    )
    routing_mode: str = Field(
        default="",
        description="Override ROUTING_MODE env var: auto | local_only | claude_only",
    )


class ThinkResponse(BaseModel):
    response: str
    model_used: str
    routing_reason: str
    duration_ms: int
    task_profile: dict[str, Any]


# ─── /chat ────────────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: str = Field(..., description="user | assistant")
    content: str = Field(..., min_length=1, max_length=16_000)


class ChatRequest(BaseModel):
    """
    Multi-turn conversation. History is flattened into a single prompt for
    Ollama (which doesn't have native chat context). Claude uses messages API.
    """

    messages: list[ChatMessage] = Field(..., min_length=1)
    task_type: str = "reasoning"
    system_prompt: str = Field(default="", max_length=4_000)


class ChatResponse(BaseModel):
    response: str
    model_used: str
    routing_reason: str
    duration_ms: int


# ─── /models ──────────────────────────────────────────────────────────────────


class ModelInfo(BaseModel):
    key: str
    ollama_name: str = ""
    api: str = "ollama"
    strengths: list[str]
    max_complexity: str
    speed: str


class ModelsResponse(BaseModel):
    available: list[str]
    all_registered: list[ModelInfo]
    routing_mode: str
    total_available: int
