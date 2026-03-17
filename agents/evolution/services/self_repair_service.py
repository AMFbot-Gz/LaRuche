"""
services/self_repair_service.py — Auto-réparation de modules Python via Claude Code CLI

Adapté depuis ruche-corps/core/self_repair.py.

SelfRepair : génère des rapports de crash + tente de corriger automatiquement
             le fichier fautif en appelant `claude -p`.

@watch_and_repair : décorateur async/sync pour surveiller une fonction et
                    déclencher la réparation si elle lève une exception.

Rapports de crash : ~/.chimera/logs/crash_reports/crash_TIMESTAMP.txt

Route FastAPI :
  POST /repair  {error: str, traceback: str, file_path: str}
              → {success: bool, report_path: str, message: str}
"""

from __future__ import annotations

import asyncio
import functools
import inspect
import logging
import subprocess
import traceback as tb_module
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel

# ─── Config ───────────────────────────────────────────────────────────────────

# Répertoire de base Chimera dans le home de l'utilisateur
CHIMERA_DIR = Path.home() / ".chimera"
CRASH_DIR = CHIMERA_DIR / "logs" / "crash_reports"

log = logging.getLogger("chimera.evolution.self_repair")


# ─── Schemas Pydantic ─────────────────────────────────────────────────────────


class RepairRequest(BaseModel):
    error: str
    traceback: str
    file_path: str


class RepairResponse(BaseModel):
    success: bool
    report_path: str
    message: str


# ─── SelfRepair ───────────────────────────────────────────────────────────────


class SelfRepair:
    """Génère des rapports de crash et tente l'auto-réparation via Claude Code CLI."""

    def __init__(self) -> None:
        CRASH_DIR.mkdir(parents=True, exist_ok=True)

    # ── Rapport de crash ──────────────────────────────────────────────────────

    def generate_report(self, module_path: str, error: str, tb: str) -> str:
        """
        Génère un rapport de crash dans crash_reports/.
        Inclut le contenu du fichier source pour permettre l'analyse.

        Retourne le chemin absolu du rapport créé.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        report_path = CRASH_DIR / f"crash_{timestamp}.txt"

        # Lecture best-effort du fichier source
        file_content = ""
        try:
            file_content = Path(module_path).read_text(encoding="utf-8")
        except Exception as read_err:
            file_content = f"[Impossible de lire le fichier : {read_err}]"

        content = (
            f"MODULE: {module_path}\n"
            f"ERREUR: {error}\n"
            f"TRACEBACK:\n{tb}\n"
            f"CONTENU DU FICHIER:\n{file_content}\n"
        )

        report_path.write_text(content, encoding="utf-8")
        log.info("crash_report_generated: %s", report_path)
        return str(report_path)

    # ── Réparation via Claude Code CLI ───────────────────────────────────────

    def repair(self, module_path: str, error: str, tb: str) -> bool:
        """
        Génère un rapport puis appelle `claude -p` pour corriger le module.

        Retourne True si le fichier existe toujours après réparation
        (critère minimal : Claude a pu modifier le fichier sans le supprimer).
        """
        report_path = self.generate_report(module_path, error, tb)

        prompt = (
            f"Répare {module_path}. "
            f"Erreur: {error}. "
            f"Traceback: {tb[:600]}. "
            "Modifie uniquement ce fichier Python. "
            "Garde toutes les interfaces existantes intactes."
        )

        # Répertoire de travail = parent du fichier à réparer
        cwd = str(Path(module_path).parent.resolve())

        try:
            result = subprocess.run(
                ["claude", "-p", prompt],
                capture_output=True,
                text=True,
                timeout=90,
                cwd=cwd,
            )
            success = result.returncode == 0
            if not success:
                log.warning("claude_code_stderr: %s", result.stderr[:300])
            else:
                log.info("repair_completed: %s", module_path)
        except FileNotFoundError:
            log.error(
                "claude_code_cli_not_found — installez via: npm install -g @anthropic-ai/claude-code"
            )
            success = False
        except subprocess.TimeoutExpired:
            log.warning("repair_timeout: Claude Code n'a pas répondu en 90s")
            success = False
        except Exception as exc:
            log.error("repair_subprocess_error: %s", exc)
            success = False

        # Critère de succès minimal : le fichier existe toujours
        return Path(module_path).exists()


# ─── Décorateur watch_and_repair ─────────────────────────────────────────────


def watch_and_repair(func):
    """
    Décorateur qui surveille une fonction (async ou sync) et tente une
    auto-réparation si elle lève une exception.

    Comportement :
      1. Exécute func normalement.
      2. En cas d'exception : génère un rapport + appelle SelfRepair.repair().
      3. Si réparation signalée : retente func() une fois.
      4. Si échec définitif : log le rapport et retourne None.

    Usage :
        @watch_and_repair
        async def ma_coroutine():
            ...
    """

    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as exc:
            error_str = str(exc)
            tb_str = tb_module.format_exc()
            module_file = _resolve_module_path(func)

            log.error(
                "watch_and_repair triggered — func=%s error=%s",
                func.__name__,
                error_str,
            )

            repairer = SelfRepair()
            repaired = repairer.repair(module_file, error_str, tb_str)

            if repaired:
                log.info("repair_signaled — retrying %s", func.__name__)
                try:
                    return await func(*args, **kwargs)
                except Exception as retry_exc:
                    final_tb = tb_module.format_exc()
                    log.error("repair_retry_failed: %s", retry_exc)
                    repairer.generate_report(module_file, str(retry_exc), final_tb)
                    return None
            else:
                log.error("repair_failed for %s", func.__name__)
                return None

    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            error_str = str(exc)
            tb_str = tb_module.format_exc()
            module_file = _resolve_module_path(func)

            log.error(
                "watch_and_repair triggered — func=%s error=%s",
                func.__name__,
                error_str,
            )

            repairer = SelfRepair()
            repaired = repairer.repair(module_file, error_str, tb_str)

            if repaired:
                try:
                    return func(*args, **kwargs)
                except Exception as retry_exc:
                    final_tb = tb_module.format_exc()
                    repairer.generate_report(module_file, str(retry_exc), final_tb)
                    return None
            return None

    return async_wrapper if inspect.iscoroutinefunction(func) else sync_wrapper


# ─── Helper privé ─────────────────────────────────────────────────────────────


def _resolve_module_path(func) -> str:
    """Retourne le chemin absolu du fichier source d'une fonction."""
    try:
        source_file = inspect.getfile(func)
        return str(Path(source_file).resolve())
    except (TypeError, OSError):
        return f"<module inconnu : {func.__module__}.{func.__qualname__}>"


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Evolution — Self Repair Service",
    description="Auto-réparation de modules Python via Claude Code CLI",
    version="1.0.0",
)


@app.post("/repair", response_model=RepairResponse)
async def repair_endpoint(req: RepairRequest) -> RepairResponse:
    """
    Tente de réparer un fichier Python cassé.

    Body: {error: str, traceback: str, file_path: str}
    Returns: {success: bool, report_path: str, message: str}
    """
    repairer = SelfRepair()

    # Génération du rapport dans un thread (I/O bloquant)
    report_path = await asyncio.to_thread(
        repairer.generate_report,
        req.file_path,
        req.error,
        req.traceback,
    )

    # Lancement de la réparation dans un thread (subprocess bloquant)
    repaired = await asyncio.to_thread(
        repairer.repair,
        req.file_path,
        req.error,
        req.traceback,
    )

    if repaired:
        message = f"Réparation terminée pour {req.file_path}"
    else:
        message = f"Réparation échouée ou fichier introuvable : {req.file_path}"

    return RepairResponse(
        success=repaired,
        report_path=report_path,
        message=message,
    )


@app.get("/repair/reports")
async def list_reports() -> dict:
    """Liste les rapports de crash disponibles."""
    if not CRASH_DIR.exists():
        return {"reports": [], "total": 0}
    reports = sorted(CRASH_DIR.glob("crash_*.txt"), reverse=True)
    return {
        "reports": [str(r) for r in reports[:20]],
        "total": len(reports),
        "crash_dir": str(CRASH_DIR),
    }
