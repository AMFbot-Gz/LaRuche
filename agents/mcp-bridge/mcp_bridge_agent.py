"""
mcp_bridge_agent.py — FastAPI app pour le MCP-Bridge Agent (:8007)

Le MCP-Bridge est le pont entre les agents Python et les serveurs MCP Node.js
exposés par la Queen (:3000). Il :
  1. Expose une API REST simple pour appeler n'importe quel outil MCP
  2. Gère la dégradation gracieuse si la Queen est indisponible
  3. Fournit une liste d'outils disponibles (Queen ou fallback hardcodé)

Endpoints :
  GET  /health         — liveness (queen_reachable: bool, tools_count: int)
  GET  /status         — état détaillé
  GET  /tools          — liste tous les outils MCP disponibles
  POST /call           — appelle un outil MCP par nom + paramètres
  POST /call/{tool}    — alias pratique (ex: /call/take_screenshot)

Lancement :
  uvicorn agents.mcp-bridge.mcp_bridge_agent:app --port 8007 --reload
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from schemas.mcp_schemas import (
    CallToolRequest,
    CallToolResponse,
    HealthResponse,
    StatusResponse,
    ToolInfo,
    ToolsResponse,
)
from services.mcp_client import KNOWN_TOOLS, McpClient


class _AliasBody(BaseModel):
    """Body optionnel pour la route alias /call/{tool} — tool vient de l'URL."""

    params: dict[str, Any] = Field(default_factory=dict)
    timeout: int = Field(default=30, ge=1, le=300)

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera MCP-Bridge Agent",
    description="Pont Python↔MCP Node.js — proxy REST vers les serveurs MCP de la Queen",
    version="1.0.0",
)

# Singleton client MCP
_client = McpClient()


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """
    Liveness check — utilisé par le Queen HealthMonitor.

    Retourne toujours 200, même si la Queen est indisponible.
    queen_reachable indique si la Queen répond.
    """
    queen_reachable = await _client.is_queen_reachable()
    tools, _ = await _client.list_tools()
    return HealthResponse(
        status="ok",
        service="mcp-bridge",
        timestamp=datetime.now(timezone.utc).isoformat(),
        queen_reachable=queen_reachable,
        tools_count=len(tools),
    )


@app.get("/status", response_model=StatusResponse)
async def status() -> StatusResponse:
    """État détaillé du bridge : URL Queen, disponibilité, source des outils."""
    queen_reachable = await _client.is_queen_reachable()
    tools, queen_available = await _client.list_tools()
    source = "queen" if queen_available else "fallback"
    return StatusResponse(
        status="ok",
        service="mcp-bridge",
        port=8007,
        timestamp=datetime.now(timezone.utc).isoformat(),
        queen_url=_client.queen_url,
        queen_reachable=queen_reachable,
        tools_count=len(tools),
        source=source,
    )


@app.get("/tools", response_model=ToolsResponse)
async def list_tools() -> ToolsResponse:
    """
    Liste tous les outils MCP disponibles.

    Si la Queen est joignable, retourne sa liste d'outils avec source="queen".
    Sinon retourne la liste hardcodée KNOWN_TOOLS avec source="fallback".
    """
    tools_raw, queen_available = await _client.list_tools()
    source = "queen" if queen_available else "fallback"
    tools = [
        ToolInfo(
            name=t["name"],
            description=t.get("description", ""),
            params=t.get("params", {}),
        )
        for t in tools_raw
    ]
    return ToolsResponse(
        tools=tools,
        total=len(tools),
        queen_available=queen_available,
        source=source,
    )


@app.post("/call", response_model=CallToolResponse)
async def call_tool(req: CallToolRequest) -> CallToolResponse:
    """
    Appelle un outil MCP par nom et paramètres.

    Retourne toujours 200 — success=False si l'outil échoue ou la Queen est down.
    duration_ms est toujours présent dans la réponse.
    """
    result, queen_available = await _client.call_tool(
        tool_name=req.tool,
        params=req.params,
        timeout=req.timeout,
    )
    return CallToolResponse(
        success=result["success"],
        tool=req.tool,
        result=result.get("result"),
        error=result.get("error"),
        duration_ms=result["duration_ms"],
        queen_available=queen_available,
    )


@app.post("/call/{tool}", response_model=CallToolResponse)
async def call_tool_alias(tool: str, body: _AliasBody | None = None) -> CallToolResponse:
    """
    Alias pratique : POST /call/take_screenshot

    Le body est optionnel (params et timeout utilisent leurs valeurs par défaut).
    Le nom de l'outil vient toujours de l'URL.
    """
    if body is None:
        body = _AliasBody()
    req = CallToolRequest(tool=tool, params=body.params, timeout=body.timeout)

    result, queen_available = await _client.call_tool(
        tool_name=req.tool,
        params=req.params,
        timeout=req.timeout,
    )
    return CallToolResponse(
        success=result["success"],
        tool=req.tool,
        result=result.get("result"),
        error=result.get("error"),
        duration_ms=result["duration_ms"],
        queen_available=queen_available,
    )


# ─── Lancement direct ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("mcp_bridge_agent:app", host="0.0.0.0", port=8007, reload=True)
