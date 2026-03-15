"""
executor_agent.py — FastAPI app pour l'Executor Agent (:8004)

L'Executor Agent est le bras armé de Chimera. Il :
  1. Exécute des commandes shell avec contrôles de sécurité
  2. Contrôle le clavier (raccourcis, saisie de texte)
  3. Contrôle la souris (clics à des coordonnées précises)
  4. Ouvre des applications macOS

Endpoints :
  GET  /health       — liveness check (Queen HealthMonitor)
  GET  /status       — capacités (clavier, souris, shell, plateforme)
  POST /run_command  — exécute une commande shell sécurisée
  POST /key_press    — presse une touche ou combinaison de touches
  POST /type_text    — tape du texte via le clavier virtuel
  POST /mouse_click  — clique à des coordonnées précises
  POST /open_app     — ouvre une application macOS

Sécurité shell :
  - 29 patterns dangereux bloqués (rm -rf /, sudo, shutdown, etc.)
  - Timeout strict (max 300s, défaut 30s)
  - Environnement minimal (PATH contrôlé)
  - Sortie tronquée à 64KB

Lancement :
  uvicorn agents.executor.executor_agent:app --port 8004 --reload
"""

from __future__ import annotations

import sys
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException

from agents.executor.schemas.executor_schemas import (
    ExecutorStatusResponse,
    KeyPressRequest,
    KeyPressResponse,
    MouseClickRequest,
    MouseClickResponse,
    OpenAppRequest,
    OpenAppResponse,
    RunCommandRequest,
    RunCommandResponse,
    TypeTextRequest,
    TypeTextResponse,
)
from agents.executor.services import keyboard_service, shell_service

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Executor Agent",
    description="Le bras armé de Chimera — shell sécurisé, clavier, souris, applications",
    version="1.0.0",
)


# ─── /health ──────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Liveness check — format stable pour Queen HealthMonitor."""
    return {
        "status":             "ok",
        "service":            "executor",
        "timestamp":          datetime.now(timezone.utc).isoformat(),
        "keyboard_available": keyboard_service.is_keyboard_available(),
        "shell_available":    True,
        "platform":           sys.platform,
    }


# ─── /status ──────────────────────────────────────────────────────────────────


@app.get("/status", response_model=ExecutorStatusResponse)
async def status() -> ExecutorStatusResponse:
    """Capacités détaillées de l'agent."""
    return ExecutorStatusResponse(
        service=                "executor",
        keyboard_available=     keyboard_service.is_keyboard_available(),
        mouse_available=        keyboard_service.is_mouse_available(),
        shell_available=        True,
        platform=               sys.platform,
        safe_commands_only=     True,
        blocked_patterns_count= shell_service.get_blocked_patterns_count(),
    )


# ─── /run_command ─────────────────────────────────────────────────────────────


@app.post("/run_command", response_model=RunCommandResponse)
async def run_command(req: RunCommandRequest) -> RunCommandResponse:
    """
    Exécute une commande shell avec contrôles de sécurité.

    La commande est vérifiée contre 29 patterns dangereux avant exécution.
    Si la commande est bloquée, retourne blocked=True avec la raison.
    Ne lève pas d'exception — toujours une réponse structurée.

    Timeout max : 300s. Sortie max : 64KB.
    """
    t0 = time.monotonic()

    result = shell_service.run_command(
        command=req.command,
        timeout=req.timeout,
        working_dir=req.working_dir,
        env_extra=req.env_extra,
    )

    duration_ms = int((time.monotonic() - t0) * 1000)

    return RunCommandResponse(
        success=      result["success"],
        stdout=       result["stdout"],
        stderr=       result["stderr"],
        return_code=  result["return_code"],
        command=      req.command,
        duration_ms=  duration_ms,
        blocked=      result["blocked"],
        block_reason= result["block_reason"],
    )


# ─── /key_press ───────────────────────────────────────────────────────────────


@app.post("/key_press", response_model=KeyPressResponse)
async def key_press(req: KeyPressRequest) -> KeyPressResponse:
    """
    Presse une touche ou une combinaison de touches.

    Exemples :
      ["command", "c"]  → Copier
      ["command", "v"]  → Coller
      ["ctrl", "z"]     → Annuler
      ["f5"]            → Actualiser
      ["escape"]        → Échap

    Nécessite les permissions Accessibility macOS.
    """
    t0 = time.monotonic()

    if not keyboard_service.is_keyboard_available():
        raise HTTPException(
            status_code=503,
            detail="pyautogui non disponible — installez : pip install pyautogui",
        )

    result = keyboard_service.press_keys(
        keys=req.keys,
        presses=req.presses,
        interval=req.interval,
    )
    duration_ms = int((time.monotonic() - t0) * 1000)

    return KeyPressResponse(
        success=    result["success"],
        keys=       req.keys,
        presses=    req.presses,
        duration_ms=duration_ms,
        error=      result.get("error"),
    )


# ─── /type_text ───────────────────────────────────────────────────────────────


@app.post("/type_text", response_model=TypeTextResponse)
async def type_text(req: TypeTextRequest) -> TypeTextResponse:
    """
    Tape du texte caractère par caractère.

    Supporte ASCII directement. Pour les caractères Unicode,
    utilise le presse-papier macOS automatiquement.

    Nécessite les permissions Accessibility macOS.
    """
    t0 = time.monotonic()

    if not keyboard_service.is_keyboard_available():
        raise HTTPException(
            status_code=503,
            detail="pyautogui non disponible",
        )

    result = keyboard_service.type_text(text=req.text, interval=req.interval)
    duration_ms = int((time.monotonic() - t0) * 1000)

    return TypeTextResponse(
        success=    result["success"],
        chars_typed=result["chars_typed"],
        duration_ms=duration_ms,
        error=      result.get("error"),
    )


# ─── /mouse_click ─────────────────────────────────────────────────────────────


@app.post("/mouse_click", response_model=MouseClickResponse)
async def mouse_click(req: MouseClickRequest) -> MouseClickResponse:
    """
    Clique à des coordonnées précises.

    Les coordonnées sont validées par rapport à la résolution écran.
    Double-clic : clicks=2. Clic droit : button="right".

    Nécessite les permissions Accessibility macOS.
    """
    t0 = time.monotonic()

    if not keyboard_service.is_mouse_available():
        raise HTTPException(
            status_code=503,
            detail="pyautogui non disponible",
        )

    result = keyboard_service.mouse_click(
        x=req.x,
        y=req.y,
        button=req.button,
        clicks=req.clicks,
        move_duration=req.move_duration,
    )
    duration_ms = int((time.monotonic() - t0) * 1000)

    return MouseClickResponse(
        success=    result["success"],
        x=          req.x,
        y=          req.y,
        button=     req.button,
        clicks=     req.clicks,
        duration_ms=duration_ms,
        error=      result.get("error"),
    )


# ─── /open_app ────────────────────────────────────────────────────────────────


@app.post("/open_app", response_model=OpenAppResponse)
async def open_app(req: OpenAppRequest) -> OpenAppResponse:
    """
    Ouvre une application macOS via `open -a <nom>`.

    Exemples :
      {"app": "Terminal"}
      {"app": "Visual Studio Code"}
      {"app": "Safari", "args": ["https://chimera.dev"]}

    Retourne success=False si l'application est introuvable.
    """
    t0 = time.monotonic()

    result = keyboard_service.open_app(app=req.app, args=req.args)
    duration_ms = int((time.monotonic() - t0) * 1000)

    return OpenAppResponse(
        success=    result["success"],
        app=        req.app,
        duration_ms=duration_ms,
        error=      result.get("error"),
    )


# ─── Lancement direct ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "agents.executor.executor_agent:app",
        host="0.0.0.0",
        port=8004,
        reload=True,
    )
