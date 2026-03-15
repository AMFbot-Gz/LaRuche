"""
vision_service.py — Service Claude Vision pour Computer Use

Utilise Claude claude-sonnet-4-6 avec vision pour analyser le screenshot
et recommander la prochaine action vers un goal.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

import anthropic
from pydantic import BaseModel

logger = logging.getLogger(__name__)


# ─── Modèles de données ───────────────────────────────────────────────────────


class ClickableElement(BaseModel):
    """Un élément interactif détecté sur l'écran."""

    label: str
    x: float
    y: float
    confidence: float = 1.0


class NextAction(BaseModel):
    """Prochaine action recommandée par Claude Vision."""

    type: str  # click, type, scroll, key, wait, done
    target: Optional[str] = None
    value: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None


class VisionAnalysis(BaseModel):
    """Résultat complet de l'analyse Claude Vision."""

    ui_state: str
    clickable_elements: list[ClickableElement]
    next_action: NextAction
    goal_progress: int  # 0-100
    goal_achieved: bool
    reasoning: str


# ─── Fonction principale ──────────────────────────────────────────────────────


async def understand_screen(
    screenshot_b64: str,
    goal: str,
    history: list[dict] | None = None,
) -> VisionAnalysis:
    """
    Claude Vision analyse le screenshot et retourne l'action suivante pour atteindre le goal.

    Args:
        screenshot_b64 : Screenshot PNG encodé en base64
        goal           : L'objectif à atteindre en langage naturel
        history        : Historique des actions précédentes (optionnel, 5 dernières utilisées)

    Returns:
        VisionAnalysis avec la prochaine action recommandée

    Raises:
        ValueError    : ANTHROPIC_API_KEY non configurée
        RuntimeError  : Réponse Claude non parseable (JSON invalide ou structure inattendue)
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY non configurée")

    client = anthropic.Anthropic(api_key=api_key)

    # Construction du contexte historique (5 dernières actions max)
    history_text = ""
    if history:
        history_text = "\n\nActions précédentes:\n" + "\n".join(
            f"- {a.get('action', '')} → {a.get('result', '')}"
            for a in history[-5:]
        )

    prompt = f"""Tu es un agent de Computer Use expert. Tu analyses des screenshots macOS pour accomplir des objectifs.

OBJECTIF: {goal}
{history_text}

Analyse ce screenshot et retourne UNIQUEMENT un JSON valide (sans markdown) avec cette structure exacte:
{{
  "ui_state": "description précise de ce qui est visible à l'écran",
  "clickable_elements": [
    {{"label": "nom du bouton/lien", "x": 0.5, "y": 0.3, "confidence": 0.9}}
  ],
  "next_action": {{
    "type": "click|type|key|scroll|wait|done",
    "target": "description de la cible",
    "value": "texte à taper ou touche à presser",
    "x": 0.5,
    "y": 0.3
  }},
  "goal_progress": 30,
  "goal_achieved": false,
  "reasoning": "explication courte de pourquoi cette action"
}}

Les coordonnées x,y sont entre 0 et 1 (proportion de l'écran).
Si goal_achieved est true, type = "done"."""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": screenshot_b64,
                    },
                },
                {
                    "type": "text",
                    "text": prompt,
                },
            ],
        }],
    )

    raw = response.content[0].text.strip()

    # Nettoyer si Claude wrape la réponse dans un bloc markdown
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Réponse Claude Vision non parseable : %s", raw[:200])
        raise RuntimeError(f"Réponse Claude Vision invalide (JSON) : {exc}") from exc

    try:
        return VisionAnalysis(**data)
    except Exception as exc:
        logger.error("Structure VisionAnalysis invalide : %s", data)
        raise RuntimeError(f"Structure de réponse Claude Vision inattendue : {exc}") from exc
