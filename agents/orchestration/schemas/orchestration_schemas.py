"""
schemas/orchestration_schemas.py — Modèles Pydantic pour l'Orchestration Agent.

Ces schémas définissent les structures de données échangées entre
l'Orchestration Agent et ses clients (Queen, autres agents).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ─── Étape de mission ─────────────────────────────────────────────────────────


class MissionStep(BaseModel):
    """
    Représente une étape atomique d'une mission.
    Chaque étape cible un agent spécifique avec un endpoint et un payload.
    """

    id: str = Field(..., description="Identifiant unique de l'étape (UUID)")
    agent: str = Field(
        ...,
        description="Agent cible : brain | executor | memory | perception | evolution",
    )
    endpoint: str = Field(
        ...,
        description="Endpoint HTTP de l'agent, ex: /think, /run_command",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Paramètres à envoyer à l'agent",
    )
    status: str = Field(
        default="pending",
        description="État : pending | running | done | failed",
    )
    result: dict[str, Any] | None = Field(
        default=None,
        description="Résultat retourné par l'agent",
    )
    error: str | None = Field(
        default=None,
        description="Message d'erreur si l'étape a échoué",
    )
    duration_ms: int = Field(
        default=0,
        description="Durée d'exécution en millisecondes",
    )


# ─── /orchestrate ─────────────────────────────────────────────────────────────


class OrchestrateRequest(BaseModel):
    """
    Requête pour orchestrer une mission haut-niveau.

    Example:
        {
          "objective": "Organise mes fichiers Downloads",
          "timeout": 120,
          "context": "Le dossier Downloads est à ~/Downloads"
        }
    """

    objective: str = Field(
        ...,
        min_length=1,
        max_length=2_000,
        description="Objectif haut-niveau à accomplir",
    )
    timeout: int = Field(
        default=120,
        ge=1,
        le=600,
        description="Timeout global de la mission en secondes",
    )
    context: str = Field(
        default="",
        max_length=4_000,
        description="Contexte additionnel pour la planification",
    )


class OrchestrateResponse(BaseModel):
    """Résultat complet d'une mission orchestrée."""

    mission_id: str = Field(..., description="Identifiant unique de la mission")
    objective: str = Field(..., description="Objectif original")
    status: str = Field(
        ...,
        description="État final : completed | partial | failed",
    )
    steps: list[MissionStep] = Field(
        default_factory=list,
        description="Liste des étapes exécutées",
    )
    summary: str = Field(
        ...,
        description="Résumé en langue naturelle du résultat",
    )
    duration_ms: int = Field(..., description="Durée totale en millisecondes")


# ─── /delegate ────────────────────────────────────────────────────────────────


class DelegateRequest(BaseModel):
    """
    Requête pour déléguer une tâche atomique à un agent spécifique.

    Example:
        {
          "agent": "brain",
          "endpoint": "/think",
          "payload": {"prompt": "Explique les trous noirs"}
        }
    """

    agent: str = Field(
        ...,
        description="Agent cible : brain | executor | memory | perception | evolution",
    )
    endpoint: str = Field(
        ...,
        description="Endpoint de l'agent, ex: /think",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Données à envoyer à l'agent",
    )
    timeout: int = Field(
        default=30,
        ge=1,
        le=300,
        description="Timeout de la requête en secondes",
    )


class DelegateResponse(BaseModel):
    """Résultat d'une délégation à un agent."""

    success: bool = Field(..., description="True si l'agent a répondu avec succès")
    agent: str = Field(..., description="Agent contacté")
    endpoint: str = Field(..., description="Endpoint appelé")
    data: dict[str, Any] = Field(
        default_factory=dict,
        description="Données retournées par l'agent",
    )
    duration_ms: int = Field(..., description="Durée de la requête en millisecondes")
    error: str | None = Field(
        default=None,
        description="Message d'erreur si la délégation a échoué",
    )


# ─── Mission record (in-memory store) ────────────────────────────────────────


class MissionRecord(BaseModel):
    """Enregistrement d'une mission dans le store in-memory."""

    mission_id: str
    objective: str
    status: str  # "running" | "completed" | "partial" | "failed"
    steps: list[MissionStep] = Field(default_factory=list)
    summary: str = ""
    started_at: str = ""
    finished_at: str | None = None
    duration_ms: int = 0
