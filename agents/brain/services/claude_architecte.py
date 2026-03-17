"""
claude_architecte.py — Claude claude-opus-4-6 comme Architecte de Ruche (Chimera v6)

Reçoit des messages (Telegram / API), appelle les APIs Chimera via tool use,
apprend et sauvegarde des scripts réutilisables dans skills/.

Aucun Ollama, aucun sous-agent, aucun screenshot inutile.
Claude agit comme cerveau + bras via les APIs de la ruche.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import anthropic

# ─── Config ───────────────────────────────────────────────────────────────────

CLAUDE_MODEL = "claude-opus-4-6"
# Remonte de agents/brain/services/ → monorepo root
ROOT = Path(__file__).resolve().parent.parent.parent.parent

PORTS: dict[str, int] = {
    "queen_node":   3000,
    "orchestration": 8001,
    "perception":   8002,
    "brain":        8003,
    "executor":     8004,
    "evolution":    8005,
    "memory":       8006,
    "mcp_bridge":   8007,
    "voice":        8010,
}

SYSTEM_PROMPT_BASE = """Tu es l'Architecte de Ruche — Claude claude-opus-4-6 branché sur Chimera v6, un OS agentique cognitif sur macOS.

## Ce que tu peux faire via tes outils

Tu contrôles Chimera en appelant ses APIs. Tu n'as pas besoin du code source — tu as les outils.

**Outils disponibles :**
- `get_ruche_status`       — état de toutes les couches (ports 3000, 8001-8007, 8010)
- `launch_mission`         — lancer une mission autonome sur le Mac
- `list_skills`            — voir les skills MCP disponibles
- `execute_shell`          — exécuter une commande shell sécurisée (sandboxée)
- `open_app` / `goto_url`  — contrôle macOS basique
- `computer_use_screenshot`— screenshot UNIQUEMENT quand tu ne comprends pas l'état de l'écran
- `computer_use_click` / `computer_use_type` — actions GUI par label sémantique
- `get_recent_memory`      — voir les derniers épisodes pour apprendre du passé
- `save_skill_script`      — écrire un script réutilisable dans skills/
- `save_memory_episode`    — enregistrer ce qui a été appris après une action

## Règles

1. **Agis directement** — utilise les outils, ne discute pas
2. **Évite les screenshots** — utilise `get_ruche_status` d'abord
3. **Apprends** — après une action réussie, utilise `save_skill_script`
4. **Sois concis** dans tes réponses (max 500 chars, Markdown OK)
5. **Si une couche est offline** — dis-le et propose comment la relancer
6. **Réponds en français**
"""

# ─── Définitions des outils ────────────────────────────────────────────────────

TOOLS: list[dict] = [
    {
        "name": "get_ruche_status",
        "description": "Obtient l'état de toutes les couches de Chimera. À appeler en premier.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "launch_mission",
        "description": "Lance une mission autonome via la ruche.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command":  {"type": "string", "description": "Description en français de la mission"},
                "priority": {"type": "integer", "description": "Priorité 1=haute 2=normale 3=basse", "default": 2},
            },
            "required": ["command"],
        },
    },
    {
        "name": "list_skills",
        "description": "Liste tous les skills MCP disponibles.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "execute_shell",
        "description": "Exécute une commande shell sécurisée via le sandbox executor.",
        "input_schema": {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
        },
    },
    {
        "name": "open_app",
        "description": "Ouvre une application macOS par son nom.",
        "input_schema": {
            "type": "object",
            "properties": {"app_name": {"type": "string"}},
            "required": ["app_name"],
        },
    },
    {
        "name": "goto_url",
        "description": "Ouvre une URL dans Safari.",
        "input_schema": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    },
    {
        "name": "computer_use_screenshot",
        "description": "Prend un screenshot. UNIQUEMENT si tu dois voir l'état visuel.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "computer_use_click",
        "description": "Clique sur un élément UI par son label sémantique.",
        "input_schema": {
            "type": "object",
            "properties": {"element_label": {"type": "string"}},
            "required": ["element_label"],
        },
    },
    {
        "name": "computer_use_type",
        "description": "Tape du texte dans l'interface macOS active.",
        "input_schema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    },
    {
        "name": "get_recent_memory",
        "description": "Récupère les derniers épisodes de mémoire.",
        "input_schema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "default": 5}},
            "required": [],
        },
    },
    {
        "name": "save_skill_script",
        "description": "Sauvegarde un skill JS réutilisable dans skills/.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name":         {"type": "string"},
                "description":  {"type": "string"},
                "code":         {"type": "string"},
                "learned_from": {"type": "string"},
            },
            "required": ["name", "description", "code"],
        },
    },
    {
        "name": "save_memory_episode",
        "description": "Enregistre un épisode dans la mémoire épisodique.",
        "input_schema": {
            "type": "object",
            "properties": {
                "mission": {"type": "string"},
                "result":  {"type": "string"},
                "success": {"type": "boolean"},
                "learned": {"type": "string"},
            },
            "required": ["mission", "result", "success"],
        },
    },
]


# ─── Helpers HTTP ──────────────────────────────────────────────────────────────

async def _fetch(method: str, url: str, **kwargs: Any) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await getattr(c, method)(url, **kwargs)
            r.raise_for_status()
            ct = r.headers.get("content-type", "")
            return r.json() if "json" in ct else {"text": r.text[:2000], "status": r.status_code}
    except httpx.ConnectError:
        return {"_error": f"couche offline — {url}"}
    except Exception as e:
        return {"_error": str(e)[:200]}


# ─── Exécuteurs d'outils ───────────────────────────────────────────────────────

async def tool_get_ruche_status(_: dict) -> dict:
    layer_urls = {
        name: f"http://localhost:{port}/health" if name != "queen_node" else f"http://localhost:{port}/api/health"
        for name, port in PORTS.items()
    }
    checks = await asyncio.gather(
        *[_fetch("get", url) for url in layer_urls.values()],
        return_exceptions=True,
    )
    results = {
        name: (r if not isinstance(r, Exception) else {"_error": str(r)})
        for name, r in zip(layer_urls.keys(), checks)
    }
    online = sum(1 for v in results.values() if not v.get("_error") and v.get("status") == "ok")
    return {"layers": results, "online": f"{online}/{len(results)}"}


async def tool_launch_mission(inp: dict) -> dict:
    r = await _fetch("post", f"http://localhost:{PORTS['queen_node']}/api/mission",
                     json={"mission": inp["command"], "priority": inp.get("priority", 2)})
    if "_error" in r:
        r = await _fetch("post", f"http://localhost:{PORTS['orchestration']}/mission",
                         json={"command": inp["command"], "priority": inp.get("priority", 2)})
    return r


async def tool_list_skills(_: dict) -> dict:
    r = await _fetch("get", f"http://localhost:{PORTS['queen_node']}/api/skills")
    return r if isinstance(r, dict) else {"skills": r, "count": len(r)}


async def tool_execute_shell(inp: dict) -> dict:
    return await _fetch("post", f"http://localhost:{PORTS['executor']}/shell",
                        json={"command": inp["command"]})


async def tool_open_app(inp: dict) -> dict:
    return await _fetch("post", f"http://localhost:{PORTS['queen_node']}/mcp/os-control",
                        json={"action": "openApp", "app": inp["app_name"]})


async def tool_goto_url(inp: dict) -> dict:
    return await _fetch("post", f"http://localhost:{PORTS['queen_node']}/mcp/os-control",
                        json={"action": "gotoUrl", "url": inp["url"]})


async def tool_screenshot(_: dict) -> dict:
    return await _fetch("post", f"http://localhost:{PORTS['queen_node']}/mcp/os-control",
                        json={"action": "screenshot"})


async def tool_click(inp: dict) -> dict:
    return await _fetch("post", f"http://localhost:{PORTS['queen_node']}/mcp/os-control",
                        json={"action": "smartClick", "element": inp["element_label"]})


async def tool_type(inp: dict) -> dict:
    return await _fetch("post", f"http://localhost:{PORTS['queen_node']}/mcp/os-control",
                        json={"action": "typeText", "text": inp["text"]})


async def tool_get_memory(inp: dict) -> dict:
    limit = inp.get("limit", 5)
    return await _fetch("get", f"http://localhost:{PORTS['memory']}/episodes?limit={limit}")


async def tool_save_skill(inp: dict) -> dict:
    name = re.sub(r"[^a-z0-9_]", "_", inp["name"].lower())[:40]
    skill_dir = ROOT / "skills" / name
    skill_dir.mkdir(parents=True, exist_ok=True)

    (skill_dir / "skill.js").write_text(inp["code"], encoding="utf-8")

    manifest = {
        "name":         name,
        "description":  inp["description"],
        "version":      "1.0.0",
        "tier":         "learned",
        "learned_from": inp.get("learned_from", "claude-architecte"),
        "created":      datetime.now().isoformat(),
        "author":       "claude-architecte",
    }
    (skill_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    registry_path = ROOT / "skills" / "registry.json"
    try:
        registry = json.loads(registry_path.read_text()) if registry_path.exists() else {"version": "1.1.0", "skills": []}
    except Exception:
        registry = {"version": "1.1.0", "skills": []}
    registry["skills"] = [s for s in registry.get("skills", []) if s.get("name") != name]
    registry["skills"].append(manifest)
    registry["lastUpdated"] = datetime.now().isoformat()
    registry_path.write_text(json.dumps(registry, indent=2), encoding="utf-8")

    return {"success": True, "skill": name, "path": str(skill_dir)}


async def tool_save_episode(inp: dict) -> dict:
    return await _fetch("post", f"http://localhost:{PORTS['memory']}/episode",
                        json={
                            "mission":    inp["mission"],
                            "result":     inp["result"],
                            "success":    inp["success"],
                            "duration_ms": 0,
                            "model_used": CLAUDE_MODEL,
                            "skills_used": [],
                            "learned":    inp.get("learned", ""),
                        })


TOOL_HANDLERS: dict[str, Any] = {
    "get_ruche_status":        tool_get_ruche_status,
    "launch_mission":          tool_launch_mission,
    "list_skills":             tool_list_skills,
    "execute_shell":           tool_execute_shell,
    "open_app":                tool_open_app,
    "goto_url":                tool_goto_url,
    "computer_use_screenshot": tool_screenshot,
    "computer_use_click":      tool_click,
    "computer_use_type":       tool_type,
    "get_recent_memory":       tool_get_memory,
    "save_skill_script":       tool_save_skill,
    "save_memory_episode":     tool_save_episode,
}


async def execute_tool(name: str, inp: dict) -> Any:
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return {"_error": f"Outil inconnu: {name}"}
    try:
        return await handler(inp)
    except Exception as e:
        return {"_error": str(e)[:300]}


# ─── Boucle agentique Claude ───────────────────────────────────────────────────

class ClaudeArchitecte:
    """Architecte de Ruche — Claude branché sur les APIs Chimera."""

    MAX_TURNS   = 8
    MAX_HISTORY = 20
    SYSTEM_TTL  = 60  # secondes avant refresh du system prompt

    def __init__(self) -> None:
        self._client: anthropic.AsyncAnthropic | None = None
        self._history: list[dict] = []
        self._system_cache   = ""
        self._system_cache_ts: datetime = datetime.min.replace(tzinfo=timezone.utc)

    # ── System prompt avec état live ──────────────────────────────────────────

    async def _build_system_prompt(self) -> str:
        now = datetime.now(timezone.utc)
        if (now - self._system_cache_ts).total_seconds() < self.SYSTEM_TTL and self._system_cache:
            return self._system_cache

        ctx = ""
        try:
            async with httpx.AsyncClient(timeout=4) as c:
                r = await c.get(f"http://localhost:{PORTS['orchestration']}/status")
                state = r.json()
            layers  = state.get("layers", {})
            online  = sum(1 for v in layers.values() if v.get("status") == "ok")
            offline = [n for n, v in layers.items() if v.get("status") != "ok"]
            ctx = (
                f"\n\n## État Chimera ({now.strftime('%H:%M')} UTC)\n"
                f"- Couches actives: {online}/{len(layers)}\n"
            )
            if offline:
                ctx += f"- ⚠️ Offline: {', '.join(offline)}\n"
        except Exception:
            pass

        prompt = SYSTEM_PROMPT_BASE + ctx
        self._system_cache    = prompt
        self._system_cache_ts = now
        return prompt

    # ── Client lazy ───────────────────────────────────────────────────────────

    def _get_client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            key = os.environ.get("ANTHROPIC_API_KEY", "")
            if not key:
                raise ValueError("ANTHROPIC_API_KEY manquant dans .env")
            self._client = anthropic.AsyncAnthropic(api_key=key)
        return self._client

    # ── Sérialisation SDK → dicts purs ────────────────────────────────────────

    @staticmethod
    def _serialize_content(content: list) -> list[dict]:
        result = []
        for block in content:
            btype = getattr(block, "type", None)
            if btype == "text" and block.text:
                result.append({"type": "text", "text": block.text})
            elif btype == "tool_use":
                result.append({
                    "type": "tool_use",
                    "id":    block.id,
                    "name":  block.name,
                    "input": block.input,
                })
        return result

    # ── Point d'entrée principal ──────────────────────────────────────────────

    async def handle_message(self, user_text: str) -> str:
        client        = self._get_client()
        system_prompt = await self._build_system_prompt()
        self._history.append({"role": "user", "content": user_text})

        for turn in range(self.MAX_TURNS):
            try:
                response = await asyncio.wait_for(
                    client.messages.create(
                        model      = CLAUDE_MODEL,
                        max_tokens = 2048,
                        system     = system_prompt,
                        tools      = TOOLS,
                        messages   = self._history[-self.MAX_HISTORY:],
                    ),
                    timeout=90.0,
                )
            except asyncio.TimeoutError:
                return "⏱ Timeout — réessaie."
            except Exception as api_err:
                return f"❌ Erreur Claude: `{str(api_err)[:200]}`"

            if response.stop_reason == "end_turn":
                text = next((b.text for b in response.content if b.type == "text"), "")
                self._history.append({
                    "role":    "assistant",
                    "content": self._serialize_content(response.content),
                })
                return self._truncate(text)

            if response.stop_reason == "tool_use":
                tool_uses = [b for b in response.content if b.type == "tool_use"]
                results   = await asyncio.gather(
                    *[execute_tool(t.name, t.input) for t in tool_uses],
                    return_exceptions=True,
                )
                tool_results = [
                    {
                        "type":        "tool_result",
                        "tool_use_id": tool_block.id,
                        "content":     json.dumps(
                            result if not isinstance(result, Exception) else {"_error": str(result)},
                            ensure_ascii=False,
                            default=str,
                        )[:1500],
                    }
                    for tool_block, result in zip(tool_uses, results)
                ]
                self._history.append({
                    "role":    "assistant",
                    "content": self._serialize_content(response.content),
                })
                self._history.append({"role": "user", "content": tool_results})
            else:
                break

        return "⚠️ Boucle interrompue."

    @staticmethod
    def _truncate(text: str, limit: int = 4000) -> str:
        if len(text) <= limit:
            return text
        cut = text[:limit - 100]
        nl  = cut.rfind("\n")
        return (cut[:nl] if nl > limit // 2 else cut) + "\n\n_(réponse tronquée)_"

    def reset_history(self) -> None:
        self._history = []


# ─── Singleton ────────────────────────────────────────────────────────────────

_architecte: ClaudeArchitecte | None = None


def get_architecte() -> ClaudeArchitecte:
    global _architecte
    if _architecte is None:
        _architecte = ClaudeArchitecte()
    return _architecte
