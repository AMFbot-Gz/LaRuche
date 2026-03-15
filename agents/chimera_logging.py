"""
chimera_logging.py — Logger structuré partagé pour tous les agents Python

Usage dans n'importe quel agent :
    from agents.chimera_logging import get_logger
    logger = get_logger("brain")
    logger.info("Modèle chargé", extra={"model": "llama3.2:3b", "port": 8003})

Format JSON (production) :
    {"ts": "2026-03-15T05:00:00Z", "level": "INFO", "agent": "brain", "msg": "...", ...}

Format texte (développement) :
    [brain] INFO  Modèle chargé | model=llama3.2:3b port=8003

Le format est sélectionné via LOG_FORMAT=json|text (défaut: text si TTY, json sinon).
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone


class _JsonFormatter(logging.Formatter):
    """Formate les logs en JSON ligne-par-ligne, compatible avec les agrégateurs de logs."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts":    datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "level": record.levelname,
            "agent": record.name,
            "msg":   record.getMessage(),
        }
        # Champs extra (injected via extra={...} dans logger.info/warn/error)
        _RESERVED = {"name", "msg", "args", "levelname", "levelno", "pathname",
                     "filename", "module", "exc_info", "exc_text", "stack_info",
                     "lineno", "funcName", "created", "msecs", "relativeCreated",
                     "thread", "threadName", "processName", "process", "message",
                     "taskName"}
        for k, v in record.__dict__.items():
            if k not in _RESERVED:
                payload[k] = v
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class _TextFormatter(logging.Formatter):
    """Format lisible pour le terminal en développement."""

    COLORS = {
        "DEBUG":    "\033[90m",   # gris
        "INFO":     "\033[36m",   # cyan
        "WARNING":  "\033[33m",   # jaune
        "ERROR":    "\033[31m",   # rouge
        "CRITICAL": "\033[35m",   # magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color  = self.COLORS.get(record.levelname, "")
        reset  = self.RESET if color else ""
        prefix = f"{color}[{record.name}] {record.levelname:<8}{reset}"
        msg    = record.getMessage()

        # Champs extra → affichés à la fin sous forme key=value
        _RESERVED = {"name", "msg", "args", "levelname", "levelno", "pathname",
                     "filename", "module", "exc_info", "exc_text", "stack_info",
                     "lineno", "funcName", "created", "msecs", "relativeCreated",
                     "thread", "threadName", "processName", "process", "message",
                     "taskName"}
        extras = {k: v for k, v in record.__dict__.items() if k not in _RESERVED}
        if extras:
            kv = " ".join(f"{k}={v}" for k, v in extras.items())
            msg = f"{msg} | {kv}"

        line = f"{prefix} {msg}"
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def get_logger(agent_name: str, level: str | None = None) -> logging.Logger:
    """
    Retourne un logger configuré pour un agent Chimera.

    Args:
        agent_name : nom court de l'agent (ex: "brain", "executor")
        level      : niveau de log — si None, lit LOG_LEVEL (défaut: INFO)
    """
    logger = logging.getLogger(agent_name)

    # Évite de configurer deux fois le même logger (uvicorn reload)
    if logger.handlers:
        return logger

    # Niveau
    log_level = level or os.getenv("LOG_LEVEL", "INFO").upper()
    logger.setLevel(getattr(logging, log_level, logging.INFO))

    # Formatter selon LOG_FORMAT
    log_format = os.getenv("LOG_FORMAT", "text" if sys.stderr.isatty() else "json")
    formatter  = _JsonFormatter() if log_format == "json" else _TextFormatter()

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False

    return logger
