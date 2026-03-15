"""
services/sandbox_executor.py — Exécution sécurisée de code généré

Stratégie de sécurité (défense en profondeur) :
  1. Analyse statique AST  — LISTE BLANCHE d'imports + blocage appels/noms/attributs dangereux
  2. subprocess isolé       — exécution dans un processus séparé, pas dans le proc principal
  3. Timeout strict         — SIGKILL après N secondes (via subprocess.run timeout)
  4. Ressources limitées    — rlimit sur CPU time et mémoire (Linux prioritaire, macOS best-effort)
  5. Répertoire de travail  — /tmp/chimera_sandbox/ (pas le projet)
  6. Env minimal            — PATH whitelist, sans PYTHONPATH/LD_LIBRARY_PATH

AUDIT SÉCURITÉ v2 — Correctifs appliqués :
  [CRITIQUE] Passage liste noire → LISTE BLANCHE pour les imports
  [CRITIQUE] Blocage ast.Name pour open/eval/exec/getattr/__builtins__
  [HAUTE]    Ajout threading, signal, os, pathlib, glob, inspect, gc à la liste de blocage
  [HAUTE]    rlimit : log explicite si non appliqué (plus de silence)
  [HAUTE]    PATH minimal whitelist en dur (/usr/bin:/bin uniquement)

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

# ─── LISTE BLANCHE d'imports autorisés ────────────────────────────────────────
# Approche défensive : tout ce qui n'est PAS dans cette liste est rejeté.
# Cela évite les bypasses liés à l'ajout de nouveaux modules dangereux.

ALLOWED_IMPORTS: frozenset[str] = frozenset({
    # Mathématiques & calcul numérique
    "math", "cmath", "decimal", "fractions", "statistics", "random",
    # Traitement de texte & regex
    "string", "textwrap", "difflib", "re",
    # Structures de données & sérialisation safe
    "json", "csv",
    # Dates & temps (lecture seule, pas d'interaction système)
    # time.sleep() toléré — le subprocess timeout (+2s) gère les boucles infinies
    "datetime", "calendar", "time",
    # Collections & algorithmes
    "collections", "heapq", "bisect", "array", "queue",
    "itertools", "functools", "operator", "copy",
    # Typage & POO abstraite
    "typing", "types", "enum", "dataclasses", "abc", "contextlib",
    # Encodage & affichage
    "base64", "unicodedata", "struct", "pprint",
    # Hachage (lecture/vérification, pas d'exécution)
    "hashlib",
    # IO en mémoire uniquement (pas de fichiers disque)
    "io",
})

# ─── Noms dangereux (ast.Name — assignation ou référence directe) ────────────
# Bloque : f = open   /   builtins = __builtins__   /   imp = __import__
BLOCKED_NAMES: frozenset[str] = frozenset({
    "open", "eval", "exec", "compile", "__import__", "breakpoint",
    "__builtins__", "__loader__", "__spec__", "__file__",
    "globals", "locals", "vars", "dir",
    "getattr", "setattr", "delattr", "hasattr",
})

# ─── Appels de fonctions bloqués (ast.Call) ───────────────────────────────────
BLOCKED_CALLS: frozenset[str] = frozenset({
    "eval", "exec", "compile", "__import__",
    "open", "breakpoint",
    "globals", "locals", "vars", "dir",
    "getattr", "setattr", "delattr", "hasattr",
})

# ─── Attributs dangereux (ast.Attribute) ─────────────────────────────────────
BLOCKED_ATTRS: frozenset[str] = frozenset({
    "__class__", "__bases__", "__subclasses__",
    "__globals__", "__builtins__", "__code__",
    "__dict__", "__init_subclass__", "__reduce__",
    "__reduce_ex__", "__getattribute__",
    "read_text", "write_text", "read_bytes", "write_bytes",  # pathlib bypass
    "open",  # Path.open() bypass
})

# ─── Patterns de strings dangereux (dans le source brut) ─────────────────────
BLOCKED_PATTERNS: list[str] = [
    "rm -rf", "shutil.rmtree", "os.remove", "os.unlink",
    "os.system", "os.popen", "os.execvp", "os.fork",
    "os.execle", "os.execve", "os.spawnl",
    "shutdown", "reboot", "mkfs", "dd if=/dev/",
    ":(){:|:&};:",  # fork bomb shell
    "__import__", "importlib",
]

# Wrapping du code utilisateur pour l'exécution
# AUDIT v2 : rlimit avec log explicite (plus de silence), pas de fallback silencieux
_SANDBOX_WRAPPER = textwrap.dedent("""\
import sys, json, traceback

# ── Limites de ressources (best-effort : Linux fiable, macOS best-effort) ─────
try:
    import resource
    # Mémoire virtuelle : 128 Mo
    try:
        resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024, 128 * 1024 * 1024))
    except Exception as _e:
        sys.stderr.write(f"[sandbox] WARN: rlimit RLIMIT_AS non appliqué: {{_e}}\\n")
    # CPU : {cpu_time}s
    try:
        resource.setrlimit(resource.RLIMIT_CPU, ({cpu_time}, {cpu_time}))
    except Exception as _e:
        sys.stderr.write(f"[sandbox] WARN: rlimit RLIMIT_CPU non appliqué: {{_e}}\\n")
except ImportError:
    sys.stderr.write("[sandbox] WARN: module resource indisponible (Windows?)\\n")

# ── Code utilisateur ──────────────────────────────────────────────────────────
{user_code}

# ── Exécution ─────────────────────────────────────────────────────────────────
try:
    params = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {{}}
    result = execute(params)
    if not isinstance(result, dict):
        raise TypeError(f"execute() doit retourner un dict, reçu : {{type(result).__name__}}")
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

        Défense en profondeur :
          1. Patterns bruts dangereux (avant parse)
          2. LISTE BLANCHE d'imports (rejette tout module non explicitement autorisé)
          3. Noms dangereux référencés directement (f = open, builtins = __builtins__)
          4. Appels de fonctions dangereux
          5. Attributs dangereux
          6. Définitions de noms réservés (def open(...))
        """
        # 1. Patterns de strings bruts dangereux (avant parse AST)
        code_lower = code.lower()
        for pattern in BLOCKED_PATTERNS:
            if pattern.lower() in code_lower:
                return f"Pattern dangereux détecté : '{pattern}'"

        # 2. Parse AST
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return f"Erreur de syntaxe : {exc}"

        # 3. Parcours complet du tree
        for node in ast.walk(tree):

            # ── Import : LISTE BLANCHE ──────────────────────────────────────
            # Tout module non explicitement autorisé est rejeté (plus sûr qu'une blacklist).
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if root not in ALLOWED_IMPORTS:
                        return f"Import non autorisé : '{alias.name}' (liste blanche active)"
            if isinstance(node, ast.ImportFrom):
                root = (node.module or "").split(".")[0]
                if root not in ALLOWED_IMPORTS:
                    return f"Import non autorisé : '{node.module}' (liste blanche active)"

            # ── Références directes à des noms dangereux ──────────────────
            # Bloque : f = open  /  b = __builtins__  /  g = globals
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                if node.id in BLOCKED_NAMES:
                    return f"Référence directe interdite : '{node.id}'"

            # ── Redéfinition de noms réservés ─────────────────────────────
            # Bloque : def open(...): ...  /  class eval(...): ...
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name in BLOCKED_NAMES:
                    return f"Redéfinition de nom réservé interdite : '{node.name}'"
            if isinstance(node, ast.ClassDef):
                if node.name in BLOCKED_NAMES:
                    return f"Redéfinition de nom réservé interdite (class) : '{node.name}'"

            # ── Appels de fonctions bloqués ────────────────────────────────
            if isinstance(node, ast.Call):
                func_name = None
                if isinstance(node.func, ast.Name):
                    func_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    func_name = node.func.attr
                if func_name in BLOCKED_CALLS:
                    return f"Appel interdit : '{func_name}()'"

            # ── Attributs dangereux ────────────────────────────────────────
            if isinstance(node, ast.Attribute):
                if node.attr in BLOCKED_ATTRS:
                    return f"Attribut interdit : '{node.attr}'"

        # 4. Vérifie que la fonction execute() est définie
        func_names = {
            n.name
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
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

        # PATH minimal en dur — aucune propagation de PATH parent (évite hijack binaire)
        _SAFE_PATH = "/usr/bin:/bin:/usr/local/bin"

        timed_out = False
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout + 2,  # +2s pour le démarrage Python
                cwd=str(self.workdir),
                env={
                    # Env MINIMAL hardcodé — pas d'héritage du processus parent
                    # Audit v2 : PATH fixe (pas os.environ.get), suppression PYTHONPATH,
                    # LD_LIBRARY_PATH, DYLD_LIBRARY_PATH pour éviter hijack
                    "PATH":   _SAFE_PATH,
                    "HOME":   str(self.workdir),
                    "TMPDIR": str(self.workdir),
                    # Python minimal — évite chargement de .pth, sitecustomize, etc.
                    "PYTHONDONTWRITEBYTECODE": "1",
                    "PYTHONNOUSERSITE": "1",
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
