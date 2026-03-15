"""
services/sandbox_executor.py — Exécution sécurisée de code généré

Stratégie de sécurité (défense en profondeur) :
  1. Analyse statique AST  — bloque les imports/appels dangereux avant exécution
  2. subprocess isolé       — exécution dans un processus séparé, pas dans le proc principal
  3. Timeout strict         — SIGKILL après N secondes
  4. Ressources limitées    — rlimit sur CPU time et mémoire (macOS/Linux)
  5. Répertoire de travail  — /tmp/chimera_sandbox/ (pas le projet)

Ce qu'on ne fait PAS (trade-offs acceptés pour dev local) :
  - Pas de chroot/container (nécessite root)
  - Pas de seccomp (Linux only, complexe)
  - Pas de réseau désactivé (acceptable en phase dev)
"""

from __future__ import annotations

import ast
import os
import subprocess
import sys
import tempfile
import textwrap
import time
import uuid
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from agents.evolution.schemas.coding_task import ExecutionStatus, SandboxResult

# ─── Patterns dangereux ───────────────────────────────────────────────────────

# Modules interdits (imports bloqués)
BLOCKED_IMPORTS: set[str] = {
    "subprocess", "multiprocessing", "ctypes", "cffi",
    "socket", "urllib", "http", "ftplib", "smtplib",
    "pickle", "shelve", "marshal",
    "importlib", "pkgutil", "zipimport",
    "pty", "tty", "termios",
}

# Appels de fonctions dangereux
BLOCKED_CALLS: set[str] = {
    "eval", "exec", "compile", "__import__",
    "open",      # on whitelist explicitement les variantes sûres
    "breakpoint",
}

# Attributs dangereux
BLOCKED_ATTRS: set[str] = {
    "__class__", "__bases__", "__subclasses__",
    "__globals__", "__builtins__", "__code__",
}

# Patterns de strings dangereux (dans le code source)
BLOCKED_PATTERNS: list[str] = [
    "rm -rf", "shutil.rmtree", "os.remove", "os.unlink",
    "os.system", "os.popen", "os.execvp", "os.fork",
    "shutdown", "reboot", "mkfs", "dd if=/dev/",
    ":(){:|:&};:",  # fork bomb
]

# Wrapping du code utilisateur pour l'exécution
_SANDBOX_WRAPPER = textwrap.dedent("""\
import sys, json, traceback, resource

# Limite mémoire : 128 Mo
try:
    resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024, 128 * 1024 * 1024))
except Exception:
    pass

# Limite CPU : {cpu_time}s
try:
    resource.setrlimit(resource.RLIMIT_CPU, ({cpu_time}, {cpu_time}))
except Exception:
    pass

# ── Code utilisateur ──────────────────────────────────────────────────────────
{user_code}

# ── Exécution ─────────────────────────────────────────────────────────────────
try:
    params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {{}}
    result = execute(params)
    print(json.dumps(result, ensure_ascii=False, default=str))
    sys.exit(0)
except Exception:
    print(json.dumps({{"success": False, "result": "", "error": traceback.format_exc()}}))
    sys.exit(1)
""")


class SandboxExecutor:
    """
    Exécute du code Python généré dans un processus isolé sécurisé.

    Usage :
        executor = SandboxExecutor()
        result   = executor.run(code, params={"key": "value"}, timeout=10)
        print(result.stdout, result.status)
    """

    def __init__(self, workdir: Path | None = None):
        self.workdir = workdir or Path(tempfile.gettempdir()) / "chimera_sandbox"
        self.workdir.mkdir(parents=True, exist_ok=True)

    # ─── API publique ──────────────────────────────────────────────────────────

    def run(
        self,
        code: str,
        params: dict | None = None,
        timeout: int = 10,
    ) -> "SandboxResult":
        """
        Valide puis exécute le code dans un subprocess isolé.

        Returns SandboxResult avec status, stdout, stderr, return_code, duration_ms.
        """
        from agents.evolution.schemas.coding_task import ExecutionStatus, SandboxResult

        # 1. Analyse statique
        reject = self._static_analysis(code)
        if reject:
            return SandboxResult(
                status=ExecutionStatus.SANDBOX_REJECT,
                stdout="",
                stderr="",
                return_code=-1,
                duration_ms=0,
                rejected_reason=reject,
            )

        # 2. Exécution subprocess
        t0 = time.monotonic()
        try:
            stdout, stderr, rc, timed_out = self._exec_subprocess(
                code, params or {}, timeout
            )
        except Exception as exc:
            return SandboxResult(
                status=ExecutionStatus.FAILURE,
                stdout="",
                stderr=str(exc),
                return_code=-1,
                duration_ms=int((time.monotonic() - t0) * 1000),
            )

        duration_ms = int((time.monotonic() - t0) * 1000)

        if timed_out:
            status = ExecutionStatus.TIMEOUT
        elif rc == 0:
            status = ExecutionStatus.SUCCESS
        else:
            status = ExecutionStatus.FAILURE

        return SandboxResult(
            status=status,
            stdout=stdout[:4096],   # Cap à 4 Ko
            stderr=stderr[:2048],
            return_code=rc,
            duration_ms=duration_ms,
        )

    # ─── Analyse statique AST ─────────────────────────────────────────────────

    def _static_analysis(self, code: str) -> str | None:
        """
        Parcourt l'AST et retourne un message d'erreur si le code est dangereux.
        Retourne None si tout est OK.
        """
        # Check patterns de strings dangereux (avant parse AST)
        for pattern in BLOCKED_PATTERNS:
            if pattern in code:
                return f"Pattern dangereux détecté : '{pattern}'"

        # Parse AST
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return f"Erreur de syntaxe : {exc}"

        # Vérifications AST
        for node in ast.walk(tree):

            # Import bloqué
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                mod = (
                    node.module
                    if isinstance(node, ast.ImportFrom)
                    else node.names[0].name
                )
                if mod and mod.split(".")[0] in BLOCKED_IMPORTS:
                    return f"Import interdit : '{mod}'"

            # Appel de fonction bloqué
            if isinstance(node, ast.Call):
                func_name = None
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr
                if func_name in BLOCKED_CALLS:
                    return f"Appel interdit : '{func_name}()'"

            # Attribut dangereux
            if isinstance(node, ast.Attribute):
                if node.attr in BLOCKED_ATTRS:
                    return f"Attribut interdit : '{node.attr}'"

        # Vérifie que la fonction execute() est définie
        func_names = {
            n.name
            for n in ast.walk(tree)
            if isinstance(n, ast.FunctionDef)
        }
        if "execute" not in func_names:
            return "Le code doit définir une fonction execute(params: dict) -> dict"

        return None  # Tout OK

    # ─── Exécution subprocess ─────────────────────────────────────────────────

    def _exec_subprocess(
        self,
        code: str,
        params: dict,
        timeout: int,
    ) -> tuple[str, str, int, bool]:
        """
        Écrit le code dans un fichier temp et l'exécute via subprocess.
        Retourne (stdout, stderr, return_code, timed_out).
        """
        import json

        run_id  = uuid.uuid4().hex[:8]
        script  = self.workdir / f"bee_{run_id}.py"

        # Injecte le wrapper (resource limits + runner)
        wrapped = _SANDBOX_WRAPPER.format(
            user_code=code,
            cpu_time=timeout,
        )
        script.write_text(wrapped, encoding="utf-8")

        params_json = json.dumps(params)
        cmd = [sys.executable, str(script), params_json]

        timed_out = False
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout + 2,  # +2s pour le démarrage Python
                cwd=str(self.workdir),
                env={
                    # Env minimal — pas de propagation de secrets
                    "PATH":   os.environ.get("PATH", "/usr/bin:/bin"),
                    "HOME":   str(self.workdir),
                    "TMPDIR": str(self.workdir),
                },
            )
            return proc.stdout, proc.stderr, proc.returncode, False

        except subprocess.TimeoutExpired:
            timed_out = True
            return "", "Timeout dépassé", -1, True

        finally:
            # Nettoyage du fichier temporaire
            try:
                script.unlink(missing_ok=True)
            except Exception:
                pass
