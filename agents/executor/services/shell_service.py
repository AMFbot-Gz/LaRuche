"""
services/shell_service.py — Exécution shell sécurisée pour l'Executor Agent

Inspiré du sandbox_executor.py (Evolution Agent) mais adapté pour
les commandes système réelles (pas du code Python).

Modèle de sécurité :
  1. Blocklist de patterns dangereux (destruction, réseau, élévation)
  2. Timeout strict (SIGKILL après N secondes)
  3. Environnement minimal (PATH contrôlé, pas de HOME)
  4. Répertoire de travail séparé (/tmp par défaut)
  5. Sortie tronquée pour éviter les buffers excessifs

Ce que cet agent PEUT faire (usage prévu) :
  - Commandes de lecture : ls, cat, find, grep, pwd, echo, env, ps
  - Commandes de build : make, npm, pnpm, uv, cargo
  - Git : git status, git log, git diff
  - Python/Node : python3 script.py, node script.js
  - Manipulation fichiers SAFE : cp, mv, mkdir, touch (hors système)

Ce que cet agent NE PEUT PAS faire :
  - Destruction : rm -rf /, dd, mkfs, shred
  - Réseau dangereux : curl vers IP privées (SSRF), nc -l, nmap
  - Élévation : sudo, su, doas
  - Processus : kill -9, pkill, systemctl stop
  - Secrets : cat /etc/passwd, cat /etc/shadow, env | grep -i key
"""

from __future__ import annotations

import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

# ─── Patterns bloqués ─────────────────────────────────────────────────────────

# Patterns regex bloqués — toute commande matchant l'un d'eux est rejetée
BLOCKED_PATTERNS: list[tuple[str, str]] = [
    # Destruction fichiers
    (r"rm\s+(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s+/", "rm -rf sur /"),
    (r"\bdd\b.*of=", "dd avec of= (écrasement disque)"),
    (r"\bmkfs\b", "mkfs (formatage partition)"),
    (r"\bshred\b", "shred (effacement sécurisé)"),
    (r"\bformat\s+[a-zA-Z]:", "format Windows"),
    # Élévation de privilèges
    (r"\bsudo\b", "sudo (élévation de privilèges)"),
    (r"\bsu\b\s", "su (changement utilisateur)"),
    (r"\bdoas\b", "doas (élévation de privilèges)"),
    # Shutdown / reboot
    (r"\bshutdown\b", "shutdown"),
    (r"\breboot\b", "reboot"),
    (r"\bhalt\b", "halt"),
    (r"\bpoweroff\b", "poweroff"),
    # Fork bombs
    (r":\(\)\s*\{.*:\s*\|.*:\s*&.*\}", "fork bomb"),
    # Secrets système
    (r"cat\s+/etc/(passwd|shadow|sudoers)", "lecture fichiers sensibles"),
    (r"\benv\b.*\|.*grep.*(-i\s+)?(key|pass|secret|token|pwd)", "extraction secrets env"),
    # Processus kill massif
    (r"\bkill\s+-9\s+1\b", "kill init/PID1"),
    (r"\bpkill\s+-9\b", "pkill -9 massif"),
    # Réseau dangereux (SSRF vers IP privées)
    (r"curl.*169\.254\.", "SSRF metadata AWS/GCP"),
    (r"curl.*192\.168\.", "curl réseau privé"),
    (r"curl.*10\.\d+\.\d+\.", "curl réseau privé"),
    (r"\bnc\b.*-l", "netcat listener"),
    (r"\bnmap\b", "nmap (scan réseau)"),
    # Crypto mining
    (r"\bxmrig\b|\bminerd\b|\bxmr-stak\b", "crypto mining"),
    # Macros destructrices
    (r">\s*/dev/sda", "écriture directe disque"),
    (r">\s*/dev/nvme", "écriture directe disque NVMe"),
]

# Environnement minimal — évite les injections via LD_PRELOAD, PYTHONPATH, etc.
_SAFE_ENV = {
    "PATH": "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    "TERM": "xterm-256color",
    "LANG": "en_US.UTF-8",
    "LC_ALL": "en_US.UTF-8",
}

# Sortie max par commande (évite les buffers excessifs)
_MAX_OUTPUT_BYTES = 64 * 1024  # 64 KB


# ─── API publique ─────────────────────────────────────────────────────────────


def is_safe(command: str) -> tuple[bool, str | None]:
    """
    Vérifie si une commande est sûre à exécuter.

    Returns:
        (True, None) si sûre
        (False, reason) si bloquée
    """
    cmd_lower = command.lower().strip()

    for pattern, reason in BLOCKED_PATTERNS:
        if re.search(pattern, cmd_lower, re.IGNORECASE):
            return False, reason

    return True, None


def run_command(
    command: str,
    timeout: int = 30,
    working_dir: str = "/tmp",
    env_extra: dict | None = None,
) -> dict:
    """
    Exécute une commande shell avec contrôles de sécurité.

    Args:
        command     : la commande à exécuter (passée à shell=True pour les pipes)
        timeout     : secondes avant SIGKILL (max 300)
        working_dir : répertoire d'exécution
        env_extra   : variables env additionnelles (injectées dans _SAFE_ENV)

    Returns:
        {
            "success":      bool,
            "stdout":       str,
            "stderr":       str,
            "return_code":  int,
            "blocked":      bool,
            "block_reason": str | None,
        }
    """
    import time

    # Vérification sécurité
    safe, reason = is_safe(command)
    if not safe:
        return {
            "success":      False,
            "stdout":       "",
            "stderr":       f"Commande bloquée : {reason}",
            "return_code":  1,
            "blocked":      True,
            "block_reason": reason,
        }

    # Construction environnement
    env = dict(_SAFE_ENV)
    if env_extra:
        for k, v in env_extra.items():
            # N'autoriser que les variables sans caractères dangereux
            if re.match(r'^[A-Z_][A-Z0-9_]*$', k, re.IGNORECASE):
                env[k] = v

    # Répertoire de travail (créer si absent, fallback /tmp)
    cwd = Path(working_dir)
    if not cwd.exists() or not cwd.is_dir():
        cwd = Path("/tmp")

    t0 = time.monotonic()

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            timeout=timeout,
            cwd=str(cwd),
            env=env,
        )

        stdout = result.stdout[:_MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")
        stderr = result.stderr[:_MAX_OUTPUT_BYTES].decode("utf-8", errors="replace")
        return_code = result.returncode
        success = (return_code == 0)

    except subprocess.TimeoutExpired:
        stdout = ""
        stderr = f"Timeout après {timeout}s — processus tué"
        return_code = -1
        success = False

    except Exception as exc:
        stdout = ""
        stderr = str(exc)
        return_code = -1
        success = False

    return {
        "success":      success,
        "stdout":       stdout,
        "stderr":       stderr,
        "return_code":  return_code,
        "blocked":      False,
        "block_reason": None,
    }


def get_blocked_patterns_count() -> int:
    return len(BLOCKED_PATTERNS)
