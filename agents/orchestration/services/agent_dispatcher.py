"""
services/agent_dispatcher.py — Dispatch HTTP vers les agents Chimera.

AgentDispatcher envoie des requêtes HTTP asynchrones aux agents spécialisés.
Toujours silencieux sur les erreurs : retourne toujours un dict structuré.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx


class AgentDispatcher:
    """
    Dispatcher HTTP vers les agents Chimera.

    Toutes les méthodes sont async et ne lèvent jamais d'exception :
    en cas d'erreur, elles retournent {"success": False, "error": "..."}.
    """

    # URLs configurables via variables d'environnement
    AGENT_URLS: dict[str, str] = {
        "orchestration": os.getenv("AGENT_ORCHESTRATION_URL", "http://localhost:8001"),
        "perception":    os.getenv("AGENT_PERCEPTION_URL",    "http://localhost:8002"),
        "brain":         os.getenv("AGENT_BRAIN_URL",         "http://localhost:8003"),
        "executor":      os.getenv("AGENT_EXECUTOR_URL",      "http://localhost:8004"),
        "evolution":     os.getenv("AGENT_EVOLUTION_URL",     "http://localhost:8005"),
        "memory":        os.getenv("AGENT_MEMORY_URL",        "http://localhost:8006"),
        "mcp-bridge":    os.getenv("AGENT_MCP_BRIDGE_URL",    "http://localhost:8007"),
        "discovery":     os.getenv("AGENT_DISCOVERY_URL",     "http://localhost:8008"),
        "knowledge":     os.getenv("AGENT_KNOWLEDGE_URL",     "http://localhost:8009"),
    }

    async def dispatch(
        self,
        agent: str,
        endpoint: str,
        payload: dict[str, Any],
        timeout: int = 30,
    ) -> dict[str, Any]:
        """
        Envoie un POST vers <agent><endpoint> avec le payload JSON.

        Retourne toujours un dict :
            {"success": True,  "data": {...}}
          ou
            {"success": False, "data": {}, "error": "message"}

        Ne lève jamais d'exception.
        """
        base_url = self.AGENT_URLS.get(agent)
        if base_url is None:
            return {
                "success": False,
                "data": {},
                "error": f"Agent inconnu : '{agent}'. Agents disponibles : {list(self.AGENT_URLS.keys())}",
            }

        url = f"{base_url}{endpoint}"
        t0  = time.monotonic()

        try:
            async with httpx.AsyncClient(timeout=float(timeout)) as client:
                response = await client.post(url, json=payload)
                duration_ms = int((time.monotonic() - t0) * 1000)

                if response.status_code < 400:
                    try:
                        data = response.json()
                    except Exception:
                        data = {"raw": response.text}
                    return {"success": True, "data": data, "duration_ms": duration_ms}
                else:
                    return {
                        "success": False,
                        "data": {},
                        "error": f"HTTP {response.status_code}: {response.text[:200]}",
                        "duration_ms": duration_ms,
                    }

        except httpx.TimeoutException:
            duration_ms = int((time.monotonic() - t0) * 1000)
            return {
                "success": False,
                "data": {},
                "error": f"Timeout après {timeout}s sur {url}",
                "duration_ms": duration_ms,
            }
        except Exception as exc:
            duration_ms = int((time.monotonic() - t0) * 1000)
            return {
                "success": False,
                "data": {},
                "error": f"Erreur réseau vers {url}: {exc}",
                "duration_ms": duration_ms,
            }

    async def check_health(self) -> dict[str, bool]:
        """
        Vérifie le /health de chaque agent en parallèle.

        Retourne {"brain": True, "executor": False, ...}.
        Timeout court (3s) pour ne pas bloquer le démarrage.
        """

        async def _ping(name: str, base_url: str) -> tuple[str, bool]:
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    resp = await client.get(f"{base_url}/health")
                    return name, resp.status_code == 200
            except Exception:
                return name, False

        tasks = [
            _ping(name, url)
            for name, url in self.AGENT_URLS.items()
        ]
        results = await asyncio.gather(*tasks)
        return dict(results)
