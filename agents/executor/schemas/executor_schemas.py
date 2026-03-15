"""
schemas/executor_schemas.py — Pydantic models pour l'API Executor Agent.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ─── /run_command ─────────────────────────────────────────────────────────────


class RunCommandRequest(BaseModel):
    """Exécute une commande shell sécurisée."""

    command: str = Field(
        ...,
        min_length=1,
        max_length=2048,
        description="La commande shell à exécuter",
    )
    timeout: int = Field(
        default=30,
        ge=1,
        le=300,
        description="Timeout en secondes (max 300s)",
    )
    working_dir: str = Field(
        default="/tmp",
        description="Répertoire d'exécution (défaut: /tmp)",
    )
    env_extra: dict[str, str] = Field(
        default_factory=dict,
        description="Variables d'environnement additionnelles (injectées dans PATH minimal)",
    )


class RunCommandResponse(BaseModel):
    """Résultat d'une exécution shell."""

    success: bool
    stdout: str
    stderr: str
    return_code: int
    command: str
    duration_ms: int
    blocked: bool = Field(
        default=False,
        description="True si la commande a été bloquée pour sécurité",
    )
    block_reason: Optional[str] = Field(
        default=None,
        description="Raison du blocage si blocked=True",
    )


# ─── /key_press ───────────────────────────────────────────────────────────────


class KeyPressRequest(BaseModel):
    """Presse une touche ou combinaison de touches."""

    keys: list[str] = Field(
        ...,
        min_length=1,
        max_length=5,
        description="Liste de touches à presser simultanément (ex: ['command', 'c'])",
    )
    presses: int = Field(
        default=1,
        ge=1,
        le=20,
        description="Nombre de fois à répéter",
    )
    interval: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="Délai entre répétitions en secondes",
    )


class KeyPressResponse(BaseModel):
    success: bool
    keys: list[str]
    presses: int
    duration_ms: int
    error: Optional[str] = None


# ─── /type_text ───────────────────────────────────────────────────────────────


class TypeTextRequest(BaseModel):
    """Tape du texte via le clavier virtuel."""

    text: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Texte à taper",
    )
    interval: float = Field(
        default=0.05,
        ge=0.0,
        le=1.0,
        description="Délai entre chaque caractère en secondes",
    )


class TypeTextResponse(BaseModel):
    success: bool
    chars_typed: int
    duration_ms: int
    error: Optional[str] = None


# ─── /mouse_click ─────────────────────────────────────────────────────────────


class MouseClickRequest(BaseModel):
    """Click de souris à des coordonnées précises."""

    x: int = Field(..., ge=0, description="Position X (pixels)")
    y: int = Field(..., ge=0, description="Position Y (pixels)")
    button: str = Field(
        default="left",
        pattern="^(left|right|middle)$",
        description="Bouton de souris : left | right | middle",
    )
    clicks: int = Field(default=1, ge=1, le=3, description="Nombre de clics (1=simple, 2=double)")
    move_duration: float = Field(
        default=0.2,
        ge=0.0,
        le=2.0,
        description="Durée du mouvement de la souris en secondes (0 = instantané)",
    )


class MouseClickResponse(BaseModel):
    success: bool
    x: int
    y: int
    button: str
    clicks: int
    duration_ms: int
    error: Optional[str] = None


# ─── /open_app ────────────────────────────────────────────────────────────────


class OpenAppRequest(BaseModel):
    """Ouvre une application macOS."""

    app: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Nom de l'application (ex: 'Terminal', 'Safari', 'Visual Studio Code')",
    )
    args: list[str] = Field(
        default_factory=list,
        description="Arguments supplémentaires à passer à l'application",
    )


class OpenAppResponse(BaseModel):
    success: bool
    app: str
    duration_ms: int
    error: Optional[str] = None


# ─── /status ──────────────────────────────────────────────────────────────────


class ExecutorStatusResponse(BaseModel):
    service: str
    keyboard_available: bool
    mouse_available: bool
    shell_available: bool
    platform: str
    safe_commands_only: bool
    blocked_patterns_count: int
