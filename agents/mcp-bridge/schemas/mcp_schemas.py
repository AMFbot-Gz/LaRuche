"""
schemas/mcp_schemas.py — Modèles Pydantic pour le MCP-Bridge Agent API.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ─── /call ────────────────────────────────────────────────────────────────────


class CallToolRequest(BaseModel):
    """
    Appelle un outil MCP par nom avec ses paramètres.

    Exemple :
        {
          "tool": "take_screenshot",
          "params": {},
          "timeout": 30
        }
    """

    tool: str = Field(..., min_length=1, description="Nom de l'outil MCP à appeler")
    params: dict[str, Any] = Field(default_factory=dict, description="Paramètres de l'outil")
    timeout: int = Field(default=30, ge=1, le=300, description="Timeout en secondes")


class CallToolResponse(BaseModel):
    success: bool
    tool: str
    result: Any = None
    error: str | None = None
    duration_ms: int
    queen_available: bool


# ─── /tools ───────────────────────────────────────────────────────────────────


class ToolInfo(BaseModel):
    name: str
    description: str
    params: dict[str, Any] = Field(default_factory=dict)


class ToolsResponse(BaseModel):
    tools: list[ToolInfo]
    total: int
    queen_available: bool
    source: str = Field(..., description="'queen' | 'fallback'")


# ─── /health & /status ────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    service: str
    timestamp: str
    queen_reachable: bool
    tools_count: int


class StatusResponse(BaseModel):
    status: str
    service: str
    port: int
    timestamp: str
    queen_url: str
    queen_reachable: bool
    tools_count: int
    source: str
