"""
services/mission_planner.py — Décompose un objectif haut-niveau en étapes.

MissionPlanner appelle le Brain (/think) pour obtenir un plan structuré.
Si le Brain est indisponible, un plan de fallback basique est retourné.
"""

from __future__ import annotations

import json
import os
import re
import uuid
from typing import Any

import httpx

from agents.orchestration.schemas.orchestration_schemas import MissionStep


# Prompt système pour la décomposition de mission
_SYSTEM_PROMPT = """Tu es un coordinateur d'agents IA.
Décompose l'objectif en étapes atomiques, chacune ciblant un agent spécifique.

Agents disponibles :
- brain      : POST /think     → LLM, analyse, raisonnement
- executor   : POST /run_command  → commandes shell
- executor   : POST /key_press    → interactions clavier
- executor   : POST /type_text    → saisie de texte
- executor   : POST /mouse_click  → clics souris
- memory     : POST /memories     → sauvegarder une mémoire
- memory     : GET  /memories/search → rechercher des mémoires
- perception : POST /screenshot   → capture d'écran
- perception : POST /ocr          → reconnaissance de texte
- evolution  : POST /generate_and_run → générer et exécuter du code

Réponds UNIQUEMENT avec un tableau JSON valide. Chaque élément :
{
  "agent": "nom_agent",
  "endpoint": "/endpoint",
  "payload": {...},
  "description": "description courte"
}

Exemple pour "cherche des fichiers Python" :
[
  {"agent": "executor", "endpoint": "/run_command", "payload": {"command": "find . -name '*.py'"}, "description": "Recherche fichiers Python"},
  {"agent": "memory", "endpoint": "/memories", "payload": {"task": "recherche fichiers", "result": {}}, "description": "Mémoriser le résultat"}
]"""


class MissionPlanner:
    """
    Planificateur de missions : transforme un objectif en liste d'étapes.

    Stratégie principale : appel au Brain /think pour décomposition intelligente.
    Fallback : plan basique si le Brain est indisponible.
    """

    def __init__(self, brain_url: str | None = None) -> None:
        self._brain_url = brain_url or os.getenv("AGENT_BRAIN_URL", "http://localhost:8003")

    async def plan(self, objective: str, context: str = "") -> list[MissionStep]:
        """
        Décompose un objectif en étapes MissionStep.

        1. Essaie d'appeler Brain /think pour un plan intelligent
        2. Si Brain indispo → retourne un plan de fallback basique

        Args:
            objective: L'objectif haut-niveau à accomplir.
            context:   Contexte additionnel optionnel.

        Returns:
            Liste de MissionStep ordonnées à exécuter.
        """
        prompt = f"Objectif : {objective}"
        if context:
            prompt += f"\n\nContexte : {context}"

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self._brain_url}/think",
                    json={
                        "prompt": prompt,
                        "task_type": "reasoning",
                        "system_prompt": _SYSTEM_PROMPT,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    llm_response = data.get("response", "")
                    steps = self._parse_steps(llm_response)
                    if steps:
                        return steps
        except Exception:
            pass  # Brain indispo → fallback ci-dessous

        return self._fallback_plan(objective)

    def _parse_steps(self, llm_response: str) -> list[MissionStep]:
        """
        Parse la réponse LLM en étapes MissionStep structurées.

        Cherche un tableau JSON dans la réponse (même si entouré de texte).
        Retourne une liste vide si le parsing échoue.
        """
        # Extraire le bloc JSON (entre [ et ])
        json_match = re.search(r'\[.*\]', llm_response, re.DOTALL)
        if not json_match:
            return []

        try:
            raw_steps: list[dict[str, Any]] = json.loads(json_match.group())
        except json.JSONDecodeError:
            return []

        steps: list[MissionStep] = []
        valid_agents = {"brain", "executor", "memory", "perception", "evolution"}

        for raw in raw_steps:
            if not isinstance(raw, dict):
                continue
            agent    = str(raw.get("agent", "")).strip().lower()
            endpoint = str(raw.get("endpoint", "")).strip()
            payload  = raw.get("payload", {})

            if agent not in valid_agents or not endpoint:
                continue
            if not isinstance(payload, dict):
                payload = {}

            steps.append(
                MissionStep(
                    id=str(uuid.uuid4()),
                    agent=agent,
                    endpoint=endpoint,
                    payload=payload,
                    status="pending",
                )
            )

        return steps

    def _fallback_plan(self, objective: str) -> list[MissionStep]:
        """
        Plan de fallback si le Brain est indisponible.

        Retourne un plan générique : utilise le Brain pour réfléchir
        à l'objectif (sera réessayé lors du dispatch).
        """
        return [
            MissionStep(
                id=str(uuid.uuid4()),
                agent="brain",
                endpoint="/think",
                payload={
                    "prompt": objective,
                    "task_type": "reasoning",
                },
                status="pending",
            )
        ]
