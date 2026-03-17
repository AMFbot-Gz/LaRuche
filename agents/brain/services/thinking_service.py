"""
services/thinking_service.py — Pass de raisonnement silencieux pour le Brain Agent

Adapté depuis ruche-corps/core/thinking.py.

ThinkingLayer : effectue une réflexion interne avant chaque réponse LLM.
  - Analyse l'intention réelle de la requête
  - Identifie les risques et construit un plan
  - Cache LRU 200 entrées (éviction FIFO par ordre d'insertion)
  - Timeout 15s — jamais bloquant pour la réponse principale

Route FastAPI :
  POST /think  {query: str, context: str} → {thought: str, reasoning: str}
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ─── Config ───────────────────────────────────────────────────────────────────

OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
# Modèle rapide : utilise la variable d'env OLLAMA_FAST_MODEL ou fallback llama3.2:3b
MODEL_FAST = os.environ.get("OLLAMA_FAST_MODEL", "llama3.2:3b")

log = logging.getLogger("chimera.brain.thinking")

# ─── Schemas Pydantic ─────────────────────────────────────────────────────────


class ThinkRequest(BaseModel):
    query: str
    context: str = ""


class ThinkResponse(BaseModel):
    thought: str          # Résumé lisible pour injecter dans le system prompt
    reasoning: dict       # Données structurées complètes


# ─── Dataclass Thought ────────────────────────────────────────────────────────


@dataclass
class Thought:
    intent: str           # Ce que l'utilisateur veut vraiment
    context_summary: str  # Ce que l'agent sait de pertinent
    risks: list[str]      # Risques identifiés
    plan: list[str]       # Plan en étapes
    verification: str     # Comment vérifier le succès
    confidence: float     # 0.0 à 1.0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_system_injection(self) -> str:
        """Retourne le thought comme texte injectable dans un system prompt."""
        lines = [
            "=== ANALYSE INTERNE ===",
            f"Intention détectée: {self.intent}",
            f"Confiance: {self.confidence:.0%}",
        ]
        if self.risks:
            lines.append(f"Risques: {', '.join(self.risks)}")
        if self.plan:
            lines.append("Plan:")
            for i, step in enumerate(self.plan, 1):
                lines.append(f"  {i}. {step}")
        lines.append(f"Vérification: {self.verification}")
        lines.append("=== FIN ANALYSE ===")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {
            "intent": self.intent,
            "context_summary": self.context_summary,
            "risks": self.risks,
            "plan": self.plan,
            "verification": self.verification,
            "confidence": self.confidence,
            "created_at": self.created_at,
        }


# ─── Prompt ───────────────────────────────────────────────────────────────────

_THINK_PROMPT = """\
Analyse cette requête en 5 points. Réponds UNIQUEMENT en JSON valide, sans markdown.

REQUÊTE: {text}

CONTEXTE RÉCENT: {context}

JSON à retourner:
{{
  "intent": "ce que l'utilisateur veut vraiment accomplir (1 phrase précise)",
  "context_summary": "ce que tu sais de pertinent sur ce sujet (1-2 phrases)",
  "risks": ["risque1", "risque2"],
  "plan": ["étape1", "étape2", "étape3"],
  "verification": "comment vérifier que c'est réussi (critère objectif)",
  "confidence": 0.85
}}"""


# ─── ThinkingLayer ────────────────────────────────────────────────────────────


class ThinkingLayer:
    """
    Effectue un pass de raisonnement silencieux avant chaque réponse.

    Cache LRU 200 entrées : éviction FIFO (suppression des 100 plus anciens
    quand le cache est plein).
    """

    _CACHE_MAX = 200
    _CACHE_EVICT = 100  # Nombre d'entrées supprimées lors d'une éviction

    def __init__(self) -> None:
        self._cache: dict[str, Thought] = {}

    async def think(self, text: str, context: str = "") -> Thought:
        """
        Génère une Thought pour la requête donnée.

        Appel rapide (MODEL_FAST, num_predict=400) — ne ralentit pas
        la réponse principale. Retourne une Thought dégradée en cas d'erreur.
        """
        cache_key = str(hash(text[:200]))
        if cache_key in self._cache:
            log.debug("thinking_cache_hit", extra={"key": cache_key[:12]})
            return self._cache[cache_key]

        prompt = _THINK_PROMPT.format(
            text=text[:500],
            context=context[:300] if context else "Aucun contexte récent.",
        )

        data: dict = {}
        try:
            async with httpx.AsyncClient(timeout=15.0) as c:
                resp = await c.post(
                    f"{OLLAMA}/api/chat",
                    json={
                        "model": MODEL_FAST,
                        "messages": [{"role": "user", "content": prompt}],
                        "stream": False,
                        "options": {"temperature": 0.3, "num_predict": 400},
                    },
                )
            raw = resp.json().get("message", {}).get("content", "{}")
            m = re.search(r"\{[\s\S]*\}", raw)
            data = json.loads(m.group()) if m else {}
        except Exception as exc:
            log.warning("thinking_failed: %s", exc)

        thought = Thought(
            intent=data.get("intent", text[:100]),
            context_summary=data.get("context_summary", ""),
            risks=data.get("risks", []),
            plan=data.get("plan", []),
            verification=data.get("verification", ""),
            confidence=float(data.get("confidence", 0.5)),
        )

        # Éviction LRU simple : supprime les 100 plus anciens si plein
        if len(self._cache) >= self._CACHE_MAX:
            keys_to_remove = list(self._cache.keys())[: self._CACHE_EVICT]
            for k in keys_to_remove:
                del self._cache[k]

        self._cache[cache_key] = thought
        log.info(
            "thought_generated — intent=%s confidence=%.2f risks=%d plan_steps=%d",
            thought.intent[:60],
            thought.confidence,
            len(thought.risks),
            len(thought.plan),
        )
        return thought

    def should_ask_confirmation(self, thought: Thought, autonomy_level: int = 3) -> bool:
        """
        Retourne True si l'agent devrait demander confirmation avant d'agir.

        Niveau 4+ : jamais de confirmation (autonomie totale).
        Niveau 2-  : toujours demander.
        Niveau 3   : demander si confiance < 60% ou plus de 2 risques.
        """
        if autonomy_level >= 4:
            return False
        if autonomy_level <= 2:
            return True
        return thought.confidence < 0.6 or len(thought.risks) > 2

    def cache_size(self) -> int:
        return len(self._cache)


# ─── Singleton ────────────────────────────────────────────────────────────────

_thinking_layer: ThinkingLayer | None = None


def get_thinking_layer() -> ThinkingLayer:
    """Retourne le singleton ThinkingLayer (création lazy)."""
    global _thinking_layer
    if _thinking_layer is None:
        _thinking_layer = ThinkingLayer()
    return _thinking_layer


# ─── FastAPI app (montable dans brain.py via include_router ou standalone) ────

app = FastAPI(
    title="Chimera Brain — Thinking Service",
    description="Réflexion interne silencieuse avant chaque réponse LLM",
    version="1.0.0",
)


@app.post("/think", response_model=ThinkResponse)
async def think_endpoint(req: ThinkRequest) -> ThinkResponse:
    """
    Génère une analyse interne pour la requête.

    Body: {query: str, context: str}
    Returns: {thought: str (texte injectabl), reasoning: dict (données brutes)}
    """
    if not req.query.strip():
        raise HTTPException(status_code=422, detail="query ne peut pas être vide")

    layer = get_thinking_layer()
    thought = await layer.think(req.query, req.context)

    return ThinkResponse(
        thought=thought.to_system_injection(),
        reasoning=thought.to_dict(),
    )


@app.get("/think/cache")
async def cache_status() -> dict:
    """Retourne la taille du cache LRU actuel."""
    layer = get_thinking_layer()
    return {"cache_size": layer.cache_size(), "cache_max": ThinkingLayer._CACHE_MAX}
