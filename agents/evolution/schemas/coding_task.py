"""
schemas/coding_task.py — Schémas Pydantic pour l'Auto-Coder Bee

Définit les modèles de données entrants/sortants de l'endpoint
POST /generate_and_run.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ─── Enums ────────────────────────────────────────────────────────────────────

class TaskComplexity(str, Enum):
    SIMPLE  = "simple"   # 1 action, < 10 lignes
    MEDIUM  = "medium"   # logique conditionnelle, < 30 lignes
    COMPLEX = "complex"  # algo, boucles, I/O, < 100 lignes


class ExecutionStatus(str, Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    TIMEOUT = "timeout"
    SANDBOX_REJECT = "sandbox_reject"  # code refusé avant exécution


# ─── Request ──────────────────────────────────────────────────────────────────

class CodingTask(BaseModel):
    """
    Tâche envoyée à l'Auto-Coder Bee.

    Exemple :
        {
          "description": "Crée un fichier texte avec la date du jour",
          "context": {"output_dir": "/tmp", "filename": "today.txt"},
          "expected_output": "Chemin vers le fichier créé"
        }
    """
    description: str = Field(
        ...,
        min_length=10,
        max_length=2000,
        description="Description en langage naturel de ce que le code doit faire",
        examples=["Crée un fichier texte avec la date du jour dans /tmp"]
    )
    context: dict[str, Any] = Field(
        default_factory=dict,
        description="Variables disponibles dans le contexte d'exécution (max 20 clés)",
        examples=[{"output_dir": "/tmp", "filename": "result.txt"}]
    )
    expected_output: str = Field(
        default="",
        max_length=500,
        description="Description du résultat attendu (pour guider le LLM)",
        examples=["Le chemin absolu vers le fichier créé"]
    )
    complexity: TaskComplexity = Field(
        default=TaskComplexity.MEDIUM,
        description="Complexité estimée de la tâche (influence le modèle choisi)"
    )
    save_on_success: bool = Field(
        default=True,
        description="Sauvegarder le skill généré dans skills/generated/ si l'exécution réussit"
    )
    timeout_seconds: int = Field(
        default=10,
        ge=1,
        le=30,
        description="Timeout max d'exécution sandbox (1-30s)"
    )

    @field_validator("description")
    @classmethod
    def no_code_injection(cls, v: str) -> str:
        """Refuse les descriptions qui ressemblent à des injections de prompt."""
        injections = ["ignore previous", "ignore all", "disregard", "system:", "<<SYS>>"]
        v_low = v.lower()
        for pattern in injections:
            if pattern in v_low:
                raise ValueError(f"Description suspecte (pattern: '{pattern}')")
        return v.strip()

    @field_validator("context")
    @classmethod
    def limit_context_size(cls, v: dict) -> dict:
        if len(v) > 20:
            raise ValueError("context ne peut pas dépasser 20 clés")
        return v


# ─── Response ─────────────────────────────────────────────────────────────────

class GeneratedCode(BaseModel):
    """Code généré par le LLM, avant exécution."""
    raw_response:  str  # Réponse brute du LLM
    extracted_code: str  # Code Python nettoyé
    model_used:    str
    generation_ms: int


class SandboxResult(BaseModel):
    """Résultat de l'exécution sandbox."""
    status:      ExecutionStatus
    stdout:      str
    stderr:      str
    return_code: int
    duration_ms: int
    rejected_reason: str | None = None  # Si status == SANDBOX_REJECT


class CodingTaskResult(BaseModel):
    """Réponse complète de l'endpoint POST /generate_and_run."""
    task_id:       str = Field(description="UUID de la tâche")
    status:        ExecutionStatus
    generated:     GeneratedCode
    execution:     SandboxResult
    skill_saved:   bool = False
    skill_path:    str | None = None
    total_ms:      int
    timestamp:     datetime = Field(default_factory=datetime.utcnow)
    error:         str | None = None
