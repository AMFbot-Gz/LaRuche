"""
services/mcp_client.py — Client HTTP vers la Queen (:3000) pour les appels MCP.

La Queen expose les routes MCP sous /mcp/<server> avec { action, params }.
Ce client traduit les appels simples (tool_name + params) vers ce format.

Si la Queen est indisponible, le client dégrade gracieusement :
  - list_tools()        → retourne KNOWN_TOOLS (liste hardcodée)
  - call_tool()         → retourne { success: False, error: "Queen unavailable" }
  - is_queen_reachable() → retourne False
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

# ─── Configuration ────────────────────────────────────────────────────────────

QUEEN_URL: str = os.getenv("QUEEN_URL", "http://localhost:3000")

# Timeout pour la vérification de disponibilité de la Queen
QUEEN_HEALTH_TIMEOUT: float = 2.0

# Liste hardcodée des outils connus (fallback si Queen indisponible)
KNOWN_TOOLS: list[dict[str, Any]] = [
    {"name": "take_screenshot",   "description": "Capture l'écran",             "params": {}},
    {"name": "open_app",          "description": "Ouvre une application",        "params": {"app": "string"}},
    {"name": "goto_url",          "description": "Navigue vers une URL",         "params": {"url": "string"}},
    {"name": "run_command",       "description": "Exécute une commande shell",   "params": {"command": "string"}},
    {"name": "type_text",         "description": "Tape du texte",                "params": {"text": "string"}},
    {"name": "press_key",         "description": "Presse une touche",            "params": {"key": "string"}},
    {"name": "read_file",         "description": "Lit un fichier",               "params": {"path": "string"}},
    {"name": "http_fetch",        "description": "Fait une requête HTTP",        "params": {"url": "string"}},
    {"name": "summarize_project", "description": "Résume un projet",             "params": {}},
]

# Mapping outil → endpoint MCP de la Queen (dérivé de mcp_routes.js)
# Format Queen : POST /mcp/<server> avec body { action, params }
_TOOL_TO_ENDPOINT: dict[str, tuple[str, str]] = {
    "take_screenshot":   ("/mcp/os-control", "screenshot"),
    "open_app":          ("/mcp/os-control", "click"),
    "goto_url":          ("/mcp/terminal",   "exec"),
    "run_command":       ("/mcp/terminal",   "exec"),
    "type_text":         ("/mcp/os-control", "typeText"),
    "press_key":         ("/mcp/os-control", "keyPress"),
    "read_file":         ("/mcp/terminal",   "execSafe"),
    "http_fetch":        ("/mcp/terminal",   "exec"),
    "summarize_project": ("/mcp/terminal",   "execSafe"),
}


# ─── Client ───────────────────────────────────────────────────────────────────


class McpClient:
    """
    Client HTTP asynchrone vers la Queen.

    Utilise httpx.AsyncClient pour toutes les requêtes.
    Toutes les méthodes capturent les exceptions réseau — jamais de raise vers l'appelant.
    """

    def __init__(self, queen_url: str = QUEEN_URL) -> None:
        self.queen_url = queen_url.rstrip("/")

    async def is_queen_reachable(self) -> bool:
        """Vérifie si la Queen répond sous 2 secondes."""
        try:
            async with httpx.AsyncClient(timeout=QUEEN_HEALTH_TIMEOUT) as client:
                resp = await client.get(f"{self.queen_url}/mcp/health")
                return resp.status_code < 500
        except Exception:
            return False

    async def list_tools(self) -> tuple[list[dict[str, Any]], bool]:
        """
        Retourne (tools, queen_available).

        Interroge GET /mcp/health sur la Queen pour obtenir la liste des endpoints.
        Si la Queen est indisponible, retourne KNOWN_TOOLS avec queen_available=False.
        """
        try:
            async with httpx.AsyncClient(timeout=QUEEN_HEALTH_TIMEOUT) as client:
                resp = await client.get(f"{self.queen_url}/mcp/health")
                resp.raise_for_status()
                data = resp.json()

                # La Queen retourne { ok: true, endpoints: ["POST /mcp/os-control", ...] }
                endpoints: list[str] = data.get("endpoints", [])
                tools = _build_tools_from_endpoints(endpoints)
                return tools, True
        except Exception:
            return list(KNOWN_TOOLS), False

    async def call_tool(
        self,
        tool_name: str,
        params: dict[str, Any],
        timeout: int = 30,
    ) -> tuple[dict[str, Any], bool]:
        """
        Appelle un outil MCP via la Queen.

        Retourne (result_dict, queen_available).
        result_dict contient toujours { success, result, error, duration_ms }.
        Ne lève jamais d'exception.
        """
        t0 = time.monotonic()

        # Vérification préalable de disponibilité
        reachable = await self.is_queen_reachable()
        if not reachable:
            duration_ms = int((time.monotonic() - t0) * 1000)
            return {
                "success": False,
                "result": None,
                "error": "Queen unavailable",
                "duration_ms": duration_ms,
            }, False

        # Résolution endpoint + action
        endpoint_info = _TOOL_TO_ENDPOINT.get(tool_name)
        if endpoint_info is None:
            # Outil inconnu — on tente quand même via /mcp/terminal exec
            endpoint, action = "/mcp/terminal", tool_name
        else:
            endpoint, action = endpoint_info

        # Adaptation des paramètres selon l'outil
        mcp_params = _adapt_params(tool_name, params)

        try:
            async with httpx.AsyncClient(timeout=float(timeout)) as client:
                resp = await client.post(
                    f"{self.queen_url}{endpoint}",
                    json={"action": action, "params": mcp_params},
                )
                duration_ms = int((time.monotonic() - t0) * 1000)
                data = resp.json()
                success = bool(data.get("success", False))
                error = data.get("error") if not success else None
                return {
                    "success": success,
                    "result": data,
                    "error": error,
                    "duration_ms": duration_ms,
                }, True
        except httpx.TimeoutException:
            duration_ms = int((time.monotonic() - t0) * 1000)
            return {
                "success": False,
                "result": None,
                "error": f"Timeout après {timeout}s",
                "duration_ms": duration_ms,
            }, True
        except Exception as exc:
            duration_ms = int((time.monotonic() - t0) * 1000)
            return {
                "success": False,
                "result": None,
                "error": str(exc),
                "duration_ms": duration_ms,
            }, False


# ─── Helpers privés ───────────────────────────────────────────────────────────


def _build_tools_from_endpoints(endpoints: list[str]) -> list[dict[str, Any]]:
    """
    Construit la liste d'outils à partir des endpoints Queen.
    Enrichit avec les descriptions de KNOWN_TOOLS quand disponible.
    """
    known_map = {t["name"]: t for t in KNOWN_TOOLS}
    tools: list[dict[str, Any]] = []

    # Outils issus des endpoints Queen
    endpoint_tools = {
        "POST /mcp/os-control":    ["take_screenshot", "type_text", "press_key", "open_app"],
        "POST /mcp/terminal":      ["run_command", "goto_url", "read_file", "http_fetch"],
        "POST /mcp/vision":        ["summarize_project"],
        "POST /mcp/vault":         [],
        "POST /mcp/rollback":      [],
        "POST /mcp/skill-factory": [],
        "POST /mcp/janitor":       [],
        "POST /mcp/pencil":        [],
    }

    seen: set[str] = set()
    for ep in endpoints:
        for tool_name in endpoint_tools.get(ep, []):
            if tool_name not in seen:
                seen.add(tool_name)
                info = known_map.get(tool_name, {"name": tool_name, "description": "", "params": {}})
                tools.append(info)

    # Ajouter les outils connus non encore inclus
    for t in KNOWN_TOOLS:
        if t["name"] not in seen:
            tools.append(t)

    return tools


def _adapt_params(tool_name: str, params: dict[str, Any]) -> dict[str, Any]:
    """Adapte les paramètres génériques au format attendu par l'action Queen."""
    if tool_name == "run_command":
        return {"command": params.get("command", "")}
    if tool_name == "goto_url":
        url = params.get("url", "")
        return {"command": f"curl -sL '{url}' 2>&1 | head -50"}
    if tool_name == "read_file":
        path = params.get("path", "")
        return {"command": f"cat {path}"}
    if tool_name == "http_fetch":
        url = params.get("url", "")
        return {"command": f"curl -s '{url}'"}
    if tool_name == "type_text":
        return {"text": params.get("text", ""), "wpm": params.get("wpm", 65)}
    if tool_name == "press_key":
        return {"key": params.get("key", ""), "modifier": params.get("modifier")}
    return params
