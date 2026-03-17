"""
services/tools_registry.py — Registre d'outils pour l'Executor Agent

Adapté depuis ruche-corps/tools/registry.py + tools/builtins.py.

Expose les 10 outils essentiels via un registre dynamique (@tool decorator).
Chaque outil peut être appelé par l'Executor Agent via les routes FastAPI.

Outils disponibles :
  shell_exec      — Exécuter une commande shell (utilise shell_service existant)
  read_file       — Lire le contenu d'un fichier
  write_file      — Écrire/remplacer un fichier
  search_web      — Rechercher sur DuckDuckGo
  take_screenshot — Prendre un screenshot via screencapture macOS
  click_at        — Cliquer à des coordonnées (osascript)
  type_text       — Taper du texte (pbpaste + osascript)
  list_files      — Lister un répertoire avec find
  search_in_file  — Chercher un pattern regex dans un fichier
  run_python      — Exécuter du code Python et retourner le résultat

Routes FastAPI :
  GET  /tools               — liste des outils disponibles avec schémas
  POST /tools/execute       — exécuter un outil {tool: str, args: dict}
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
import re
import subprocess
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

log = logging.getLogger("chimera.executor.tools_registry")

# ─── @tool decorator ──────────────────────────────────────────────────────────


_PY_TO_JSON: dict[str, str] = {
    "str": "string",
    "int": "integer",
    "float": "number",
    "bool": "boolean",
    "list": "array",
    "dict": "object",
}


def _build_schema(fn: Callable, description: str) -> dict:
    """Construit un schéma JSON OpenAI-compatible depuis les annotations Python."""
    sig = inspect.signature(fn)
    hints: dict = {}
    try:
        hints = fn.__annotations__
    except Exception:
        pass

    props: dict = {}
    required: list[str] = []

    for pname, param in sig.parameters.items():
        if pname in ("self", "ctx"):
            continue
        type_hint = hints.get(pname, str)
        type_name = getattr(type_hint, "__name__", str(type_hint))
        json_type = _PY_TO_JSON.get(type_name, "string")
        doc_lines = (fn.__doc__ or "").strip().splitlines()
        param_desc = next(
            (
                l.strip().lstrip(f"{pname}:").strip()
                for l in doc_lines
                if l.strip().startswith(f"{pname}:")
            ),
            pname,
        )
        props[pname] = {"type": json_type, "description": param_desc}
        if param.default is inspect.Parameter.empty:
            required.append(pname)

    return {
        "type": "function",
        "function": {
            "name": fn.__name__,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": props,
                "required": required,
            },
        },
    }


@dataclass
class ToolMeta:
    name: str
    description: str
    category: str
    fn: Callable
    schema: dict


class ToolRegistry:
    """Registre central d'outils — enregistrement à chaud via @tool."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolMeta] = {}

    def register(self, meta: ToolMeta) -> None:
        self._tools[meta.name] = meta

    def get_schemas(self) -> list[dict]:
        return [m.schema for m in self._tools.values()]

    def list_tools(self) -> list[dict]:
        return [
            {
                "name": m.name,
                "description": m.description,
                "category": m.category,
            }
            for m in self._tools.values()
        ]

    async def execute(self, name: str, params: dict) -> dict:
        """Exécute un outil et retourne le résultat."""
        meta = self._tools.get(name)
        if not meta:
            return {
                "error": f"Outil inconnu: {name}. Disponibles: {[m.name for m in self._tools.values()]}"
            }
        try:
            if asyncio.iscoroutinefunction(meta.fn):
                result = await meta.fn(**params)
            else:
                result = await asyncio.to_thread(meta.fn, **params)
            return {"result": result, "tool": name}
        except TypeError as exc:
            return {"error": f"Paramètres invalides pour {name}: {exc}"}
        except Exception as exc:
            return {
                "error": f"Erreur dans {name}: {exc}",
                "trace": traceback.format_exc()[-500:],
            }

    async def execute_parallel(self, calls: list[dict]) -> list[dict]:
        """Exécute plusieurs outils en parallèle."""
        tasks = [self.execute(c["name"], c.get("arguments", {})) for c in calls]
        return list(await asyncio.gather(*tasks))


# Instance globale du registre
registry = ToolRegistry()


def tool(description: str, category: str = "general", name: str | None = None):
    """Décorateur pour enregistrer une fonction comme outil LLM."""

    def decorator(fn: Callable) -> Callable:
        fn._tool_meta = ToolMeta(
            name=name or fn.__name__,
            description=description,
            category=category,
            fn=fn,
            schema=_build_schema(fn, description),
        )
        registry.register(fn._tool_meta)
        return fn

    return decorator


# ─── Outils : SYSTÈME ─────────────────────────────────────────────────────────

@tool("Exécuter une commande shell de façon sécurisée", "system")
async def shell_exec(command: str, timeout: int = 30) -> str:
    """
    command: commande shell à exécuter
    timeout: timeout en secondes (max 120)
    """
    # Réutilise le shell_service de l'executor pour les vérifications de sécurité
    from agents.executor.services.shell_service import run_command

    result = await asyncio.to_thread(
        run_command, command, timeout=min(timeout, 120), working_dir="/tmp"
    )
    if result["blocked"]:
        return f"BLOQUÉ: {result['stderr']}"
    return (result["stdout"] or result["stderr"] or "(aucune sortie)")[:4000]


@tool("Exécuter du code Python et retourner le résultat", "system")
async def run_python(code: str, timeout: int = 30) -> str:
    """
    code: code Python à exécuter
    timeout: timeout en secondes (max 60)
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "python3", "-c", code,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=min(timeout, 60)
        )
        out = stdout.decode("utf-8", errors="replace") or stderr.decode("utf-8", errors="replace")
        return (out or "(aucune sortie)")[:3000]
    except asyncio.TimeoutError:
        return f"Timeout après {timeout}s"
    except Exception as exc:
        return f"Erreur: {exc}"


# ─── Outils : FICHIERS ────────────────────────────────────────────────────────

@tool("Lire le contenu d'un fichier", "files")
async def read_file(path: str, max_lines: int = 200) -> str:
    """
    path: chemin absolu ou relatif du fichier
    max_lines: nombre de lignes max à retourner (défaut 200)
    """
    p = Path(path).expanduser()
    if not p.exists():
        return f"Fichier introuvable: {path}"
    try:
        content = p.read_text(errors="replace")
        all_lines = content.splitlines()
        if len(all_lines) > max_lines:
            return "\n".join(all_lines[:max_lines]) + f"\n\n[...{len(all_lines) - max_lines} lignes de plus]"
        return content
    except Exception as exc:
        return f"Erreur lecture: {exc}"


@tool("Écrire ou remplacer le contenu complet d'un fichier", "files")
async def write_file(path: str, content: str) -> str:
    """
    path: chemin du fichier à écrire
    content: contenu complet à écrire
    """
    try:
        p = Path(path).expanduser()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return f"OK: {path} ({len(content)} chars)"
    except Exception as exc:
        return f"Erreur écriture: {exc}"


@tool("Lister les fichiers d'un répertoire (récursif optionnel)", "files")
async def list_files(path: str = ".", depth: int = 2) -> str:
    """
    path: répertoire à lister
    depth: profondeur max de récursion (défaut 2)
    """
    import shlex
    from agents.executor.services.shell_service import run_command

    cmd = (
        f"find {shlex.quote(path)} -maxdepth {depth} "
        "-not -path '*/node_modules/*' -not -path '*/__pycache__/*' "
        "-not -path '*/.git/*' | sort | head -100"
    )
    result = await asyncio.to_thread(run_command, cmd, timeout=15)
    return (result["stdout"] or result["stderr"] or f"Répertoire vide: {path}")[:3000]


@tool("Chercher un pattern regex dans un fichier", "files")
async def search_in_file(path: str, pattern: str, context_lines: int = 2) -> str:
    """
    path: chemin du fichier à parcourir
    pattern: expression régulière à chercher
    context_lines: lignes de contexte avant/après chaque match
    """
    p = Path(path).expanduser()
    if not p.exists():
        return f"Fichier introuvable: {path}"
    try:
        content = p.read_text(errors="replace")
        lines = content.splitlines()
        results: list[str] = []
        try:
            compiled = re.compile(pattern, re.IGNORECASE)
        except re.error as exc:
            return f"Pattern regex invalide: {exc}"

        for i, line in enumerate(lines):
            if compiled.search(line):
                start = max(0, i - context_lines)
                end = min(len(lines), i + context_lines + 1)
                snippet = "\n".join(
                    f"{'>' if j == i else ' '} L{j+1}: {lines[j]}"
                    for j in range(start, end)
                )
                results.append(snippet)

        if not results:
            return f"Aucun résultat pour '{pattern}' dans {path}"
        return f"{len(results)} match(es) dans {path}:\n\n" + "\n\n---\n".join(results[:20])
    except Exception as exc:
        return f"Erreur recherche: {exc}"


# ─── Outils : WEB ─────────────────────────────────────────────────────────────

@tool("Rechercher sur le web via DuckDuckGo", "web")
async def search_web(query: str, max_results: int = 5) -> str:
    """
    query: requête de recherche
    max_results: nombre de résultats souhaités (max 10)
    """
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as c:
            resp = await c.get(
                "https://api.duckduckgo.com/",
                params={
                    "q": query,
                    "format": "json",
                    "no_html": "1",
                    "skip_disambig": "1",
                },
                headers={"User-Agent": "Mozilla/5.0"},
            )
            data = resp.json()

        results: list[str] = []
        if data.get("AbstractText"):
            results.append(f"[Résumé] {data['AbstractText'][:500]}")
        for item in data.get("RelatedTopics", [])[: min(max_results, 10)]:
            if isinstance(item, dict) and "Text" in item:
                results.append(f"• {item['Text'][:200]}")

        return "\n".join(results) if results else f"Pas de résultats pour: {query}"
    except Exception as exc:
        return f"Erreur recherche: {exc}"


# ─── Outils : COMPUTER USE ────────────────────────────────────────────────────

@tool("Prendre un screenshot de l'écran", "computer")
async def take_screenshot(save_path: str = "") -> str:
    """
    save_path: chemin de sauvegarde optionnel (défaut: ~/.chimera/screenshots/shot_TIMESTAMP.png)
    """
    if not save_path:
        screenshot_dir = Path.home() / ".chimera" / "screenshots"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        import time as _time
        save_path = str(screenshot_dir / f"shot_{int(_time.time())}.png")

    try:
        proc = await asyncio.create_subprocess_exec(
            "screencapture", "-x", save_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
        if proc.returncode == 0:
            return f"Screenshot: {save_path}"
        return f"Erreur screencapture: {stderr.decode('utf-8', errors='replace')}"
    except FileNotFoundError:
        return "screencapture non disponible (macOS uniquement)"
    except Exception as exc:
        return f"Erreur: {exc}"


@tool("Cliquer à des coordonnées précises sur l'écran (macOS via osascript)", "computer")
async def click_at(x: int, y: int) -> str:
    """
    x: coordonnée X en pixels
    y: coordonnée Y en pixels
    """
    script = f"""
tell application "System Events"
    click at {{{x}, {y}}}
end tell
"""
    try:
        proc = await asyncio.create_subprocess_exec(
            "osascript", "-e", script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
        if proc.returncode == 0:
            return f"Clic à ({x}, {y})"
        return f"Erreur clic: {stderr.decode('utf-8', errors='replace')}"
    except Exception as exc:
        return f"Erreur: {exc}"


@tool("Taper du texte au clavier via le clipboard macOS", "computer")
async def type_text(text: str) -> str:
    """
    text: texte à taper (accents et Unicode supportés via clipboard)
    """
    # Stratégie : copier dans le clipboard puis coller via cmd+v
    script = f"""
set the clipboard to "{text.replace('"', '\\"')}"
tell application "System Events"
    keystroke "v" using command down
end tell
"""
    try:
        proc = await asyncio.create_subprocess_exec(
            "osascript", "-e", script,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
        if proc.returncode == 0:
            return f"Tapé {len(text)} chars"
        return f"Erreur type_text: {stderr.decode('utf-8', errors='replace')}"
    except Exception as exc:
        return f"Erreur: {exc}"


# ─── Schemas Pydantic (API) ───────────────────────────────────────────────────


class ExecuteRequest(BaseModel):
    tool: str
    args: dict = {}


class ExecuteResponse(BaseModel):
    tool: str
    result: Any = None
    error: str | None = None


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Executor — Tools Registry",
    description="Registre d'outils dynamiques pour l'Executor Agent",
    version="1.0.0",
)


@app.get("/tools")
async def list_tools_endpoint() -> dict:
    """Liste tous les outils disponibles avec leurs schémas."""
    return {
        "tools": registry.list_tools(),
        "schemas": registry.get_schemas(),
        "total": len(registry.list_tools()),
    }


@app.post("/tools/execute", response_model=ExecuteResponse)
async def execute_tool(req: ExecuteRequest) -> ExecuteResponse:
    """
    Exécute un outil du registre.

    Body: {tool: str, args: dict}
    Returns: {tool: str, result: any, error: str | null}
    """
    if not req.tool.strip():
        raise HTTPException(status_code=422, detail="tool ne peut pas être vide")

    result = await registry.execute(req.tool, req.args)

    if "error" in result:
        return ExecuteResponse(tool=req.tool, error=result["error"])

    return ExecuteResponse(tool=req.tool, result=result.get("result"))
