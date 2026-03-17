"""
model_router_service.py — Routage intelligent des modèles Ollama

Chaque tâche utilise le modèle optimal:
- code/debug     → qwen3-coder:480b-cloud (le meilleur pour le code)
- vision/screen  → llama3.2-vision:latest (voit les screenshots)
- rapide/check   → llama3.2:3b (réponse en <2s)
- raisonnement   → glm-4.6:cloud (strong reasoning)
- général        → gpt-oss:20b-cloud (bon équilibre)
- lourd/complex  → gpt-oss:120b-cloud (raisonnement profond)
- embed          → nomic-embed-text (vecteurs)
"""
from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# Timeouts HTTP en secondes (court=15s, moyen=90s, long=180s)
_TIMEOUTS: dict[str, int] = {"short": 15, "medium": 90, "long": 180}


# ─── Types de tâches ──────────────────────────────────────────────────────────

class TaskType(str, Enum):
    CODE      = "code"
    DEBUG     = "debug"
    VISION    = "vision"
    FAST      = "fast"
    REASONING = "reasoning"
    GENERAL   = "general"
    HEAVY     = "heavy"
    EMBED     = "embed"
    CREATIVE  = "creative"


# ─── Mapping tâche → modèle optimal ──────────────────────────────────────────

MODEL_MAP: dict[TaskType, str] = {
    TaskType.CODE:      "qwen3-coder:480b-cloud",
    TaskType.DEBUG:     "qwen3-coder:480b-cloud",
    TaskType.VISION:    "llama3.2-vision:latest",
    TaskType.FAST:      "llama3.2:3b",
    TaskType.REASONING: "glm-4.6:cloud",
    TaskType.GENERAL:   "gpt-oss:20b-cloud",
    TaskType.HEAVY:     "gpt-oss:120b-cloud",
    TaskType.EMBED:     "nomic-embed-text:latest",
    TaskType.CREATIVE:  "minimax-m2:cloud",
}

# Fallback si le modèle cloud n'est pas disponible
FALLBACK_MAP: dict[str, str] = {
    "qwen3-coder:480b-cloud": "llama3:latest",
    "gpt-oss:120b-cloud":     "llama3:latest",
    "gpt-oss:20b-cloud":      "llama3.2:3b",
    "glm-4.6:cloud":          "llama3:latest",
    "minimax-m2:cloud":       "llama3:latest",
}

# Registre complet pour la compatibilité avec l'API existante
MODEL_REGISTRY: dict[str, dict[str, Any]] = {
    "llama3.2:3b": {
        "ollama_name":    "llama3.2:3b",
        "strengths":      ["tâches simples", "instructions courtes", "rapide", "français"],
        "max_complexity": "simple",
        "speed":          "fast",
        "cost":           0,
    },
    "llama3": {
        "ollama_name":    "llama3:latest",
        "strengths":      ["raisonnement", "instructions", "français", "planification"],
        "max_complexity": "medium",
        "speed":          "medium",
        "cost":           0,
    },
    "llama3.2-vision": {
        "ollama_name":    "llama3.2-vision:latest",
        "strengths":      ["vision avancée", "raisonnement visuel", "OCR", "UI complexe"],
        "max_complexity": "complex",
        "speed":          "medium",
        "cost":           0,
    },
    "llava": {
        "ollama_name":    "llava:latest",
        "strengths":      ["vision", "analyse écran", "coordonnées", "description visuelle"],
        "max_complexity": "medium",
        "speed":          "medium",
        "cost":           0,
    },
    "moondream": {
        "ollama_name":    "moondream:latest",
        "strengths":      ["vision rapide", "description image", "détection UI"],
        "max_complexity": "simple",
        "speed":          "fast",
        "cost":           0,
    },
    "qwen3-coder": {
        "ollama_name":    "qwen3-coder:480b-cloud",
        "strengths":      ["génération code", "debug", "scripts Python", "skill generation", "refactoring"],
        "max_complexity": "complex",
        "speed":          "medium",
        "cost":           0,
    },
    "gpt-oss:20b": {
        "ollama_name":    "gpt-oss:20b-cloud",
        "strengths":      ["général", "instructions", "raisonnement moyen", "français"],
        "max_complexity": "medium",
        "speed":          "medium",
        "cost":           0,
    },
    "gpt-oss:120b": {
        "ollama_name":    "gpt-oss:120b-cloud",
        "strengths":      ["raisonnement profond", "tâches complexes", "multi-étapes", "analyse"],
        "max_complexity": "complex",
        "speed":          "slow",
        "cost":           0,
    },
    "glm-4.6": {
        "ollama_name":    "glm-4.6:cloud",
        "strengths":      ["raisonnement fort", "chain-of-thought", "mathématiques", "planification"],
        "max_complexity": "complex",
        "speed":          "medium",
        "cost":           0,
    },
    "minimax-m2": {
        "ollama_name":    "minimax-m2:cloud",
        "strengths":      ["créatif", "multimodal", "génération contenu", "brainstorm"],
        "max_complexity": "medium",
        "speed":          "medium",
        "cost":           0,
    },
    "nomic-embed-text": {
        "ollama_name":    "nomic-embed-text:latest",
        "strengths":      ["embeddings", "recherche sémantique", "similarité"],
        "max_complexity": "simple",
        "speed":          "fast",
        "cost":           0,
    },
    "claude": {
        "api":            "anthropic",
        "ollama_name":    "",
        "model_id":       os.getenv("CLAUDE_MODEL", "claude-sonnet-4-6"),
        "strengths":      ["tâches critiques", "raisonnement profond", "code complexe",
                           "auto-évolution", "analyse multi-fichiers"],
        "max_complexity": "critical",
        "speed":          "medium",
        "cost":           0.003,
    },
}


# ─── Keywords pour détecter le type de tâche automatiquement ─────────────────

TASK_KEYWORDS: dict[TaskType, list[str]] = {
    TaskType.CODE:      ["code", "python", "javascript", "function", "bug", "script",
                         "programme", "écri", "génère", "def ", "class ", "import ",
                         "pip install", "refactor"],
    TaskType.DEBUG:     ["erreur", "error", "crash", "exception", "traceback",
                         "debug", "fix", "répare", "corrige", "broken"],
    TaskType.VISION:    ["screenshot", "écran", "ecran", "image", "vois", "regarde",
                         "capture", "pixel", "clique", "bouton", "fenêtre", "icône"],
    TaskType.FAST:      ["oui", "non", "ok", "status", "ping", "check",
                         "rapide", "vite", "confirme", "valide"],
    TaskType.REASONING: ["pourquoi", "analyse", "réfléchi", "compare", "évalue",
                         "stratégie", "plan", "explique", "comprends", "deduis"],
    TaskType.CREATIVE:  ["crée", "imagine", "invente", "brainstorm", "idée",
                         "génère une idée", "innove", "rédige"],
    TaskType.HEAVY:     ["complexe", "long", "complet", "exhaustif", "tout",
                         "détaillé", "approfondi", "global"],
    TaskType.EMBED:     ["embed", "embedding", "vecteur", "similarité",
                         "sémantique", "indexe", "recherche vectorielle"],
}


# ─── DataClass profil de tâche ────────────────────────────────────────────────

@dataclass
class TaskProfile:
    complexity:          str    # simple | medium | complex | critical
    type:                str    # vision | code | action | reasoning | web
    requires_vision:     bool
    requires_code:       bool
    estimated_steps:     int
    confidence_required: float  # 0.0 – 1.0
    selected_model:      str = field(default="")
    routing_reason:      str = field(default="")

    def to_dict(self) -> dict[str, Any]:
        return {
            "complexity":          self.complexity,
            "type":                self.type,
            "requires_vision":     self.requires_vision,
            "requires_code":       self.requires_code,
            "estimated_steps":     self.estimated_steps,
            "confidence_required": self.confidence_required,
            "selected_model":      self.selected_model,
            "routing_reason":      self.routing_reason,
        }


# ─── Fonctions utilitaires ────────────────────────────────────────────────────

def detect_task_type(prompt: str) -> TaskType:
    """Détecte automatiquement le type de tâche depuis le prompt."""
    prompt_lower = prompt.lower()

    scores: dict[TaskType, int] = {task: 0 for task in TaskType}
    for task_type, keywords in TASK_KEYWORDS.items():
        for kw in keywords:
            if kw in prompt_lower:
                scores[task_type] += 1

    best = max(scores, key=lambda t: scores[t])
    if scores[best] == 0:
        return TaskType.GENERAL
    return best


def get_model_for_task(task_type: TaskType | str, fallback: bool = True) -> str:
    """Retourne le meilleur modèle pour un type de tâche."""
    if isinstance(task_type, str):
        try:
            task_type = TaskType(task_type)
        except ValueError:
            task_type = TaskType.GENERAL

    model = MODEL_MAP.get(task_type, MODEL_MAP[TaskType.GENERAL])
    return model


def get_model_for_prompt(prompt: str) -> tuple[str, TaskType]:
    """Détecte le type et retourne le modèle optimal. Retourne (model, task_type)."""
    task_type = detect_task_type(prompt)
    model = get_model_for_task(task_type)
    return model, task_type


# ─── ModelRouterService ───────────────────────────────────────────────────────

class ModelRouterService:
    """
    Routes LLM calls to the optimal model based on task analysis.

    Usage:
        router = ModelRouterService()
        response = router.think(prompt="Write a sort function", task_type="code")
        print(response)
    """

    def __init__(self) -> None:
        self.ollama_url    = OLLAMA_HOST
        self.routing_mode  = os.getenv("ROUTING_MODE", "auto")
        self.anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.available_models: list[str] = []
        self._detect_models()

    # ─── Public API ────────────────────────────────────────────────────────────

    def think(
        self,
        prompt: str,
        task_type: str = "general",
        system_prompt: str = "",
        preferred_model: str = "",
        routing_mode_override: str = "",
    ) -> tuple[str, TaskProfile]:
        """
        Analyse la tâche, sélectionne le modèle, appelle le LLM.
        Retourne (response_text, task_profile).
        """
        if not self.available_models:
            raise RuntimeError("Aucun modèle LLM disponible (Ollama inaccessible, pas de clé Anthropic)")

        profile = self.analyze_task(prompt, task_type)

        saved_mode = self.routing_mode
        if routing_mode_override:
            self.routing_mode = routing_mode_override

        if preferred_model and preferred_model in self.available_models:
            model = preferred_model
            profile.selected_model = model
            profile.routing_reason = f"préférence manuelle → {model}"
        else:
            model = self.select_model(profile)

        self.routing_mode = saved_mode

        response = self.call_model(model, prompt, system_prompt)
        return response, profile

    def chat(
        self,
        messages: list[dict[str, str]],
        task_type: str = "general",
        system_prompt: str = "",
    ) -> tuple[str, TaskProfile]:
        """
        Multi-turn conversation: fusionne l'historique en un prompt unique.
        Pour Claude, utilise l'API messages native.
        """
        if not self.available_models:
            raise RuntimeError("Aucun modèle LLM disponible")

        last_user = next(
            (m["content"] for m in reversed(messages) if m["role"] == "user"), ""
        )
        profile = self.analyze_task(last_user, task_type)
        model   = self.select_model(profile)

        if model == "claude" and self.anthropic_key:
            response = self._call_claude_chat(messages, system_prompt)
        else:
            history = "\n".join(
                f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
                for m in messages
            )
            full_prompt = f"{system_prompt}\n\n{history}" if system_prompt else history
            ollama_name = MODEL_REGISTRY.get(model, {}).get("ollama_name", model)
            response    = self._call_ollama(ollama_name, full_prompt, "")

        return response, profile

    def list_models(self) -> tuple[list[str], list[dict[str, Any]]]:
        """Returns (available_keys, all_registry_info)."""
        all_info = [
            {
                "key":            k,
                "ollama_name":    v.get("ollama_name", ""),
                "api":            v.get("api", "ollama"),
                "strengths":      v.get("strengths", []),
                "max_complexity": v.get("max_complexity", ""),
                "speed":          v.get("speed", ""),
            }
            for k, v in MODEL_REGISTRY.items()
        ]
        return self.available_models, all_info

    # ─── Détection des modèles disponibles ────────────────────────────────────

    def _detect_models(self) -> None:
        """Interroge Ollama et stocke les modèles disponibles."""
        try:
            resp = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            resp.raise_for_status()
            ollama_names = {m["name"] for m in resp.json().get("models", [])}

            for key, info in MODEL_REGISTRY.items():
                if info.get("api") == "anthropic":
                    if self.anthropic_key:
                        self.available_models.append(key)
                elif info.get("ollama_name", "") in ollama_names:
                    self.available_models.append(key)

        except Exception:
            if self.anthropic_key:
                self.available_models = ["claude"]

        print(f"🧭 Brain Router — modèles disponibles : {self.available_models}")

    def _has(self, model: str) -> bool:
        return model in self.available_models

    # ─── Analyse de la tâche ──────────────────────────────────────────────────

    def analyze_task(self, task: str, task_type: str = "") -> TaskProfile:
        """Analyse la requête et retourne un TaskProfile."""
        tl = task.lower()

        # Vision
        vision_kws = ["vois", "regarde", "écran", "ecran", "capture",
                      "screenshot", "image", "clique sur", "trouve le bouton",
                      "où est", "ou est", "position de", "bouton", "fenetre",
                      "fenêtre", "icone", "icône"]
        requires_vision = (task_type == "vision") or any(kw in tl for kw in vision_kws)

        # Code
        code_kws = ["code", "script", "python", "programme", "fonction",
                    "debug", "erreur", "installe", "pip", "import",
                    "def ", "class ", "génère un skill", "répare le code"]
        requires_code = (task_type in ("code", "debug")) or any(kw in tl for kw in code_kws)

        # Complexité
        step_kws      = ["puis", "ensuite", "après", "apres", "enfin", "d'abord",
                         "dabord", "finalement", "premièrement", "deuxièmement"]
        estimated_steps = 1 + sum(tl.count(kw) for kw in step_kws)
        word_count      = len(task.split())

        critical_kws = ["répare toi", "repare toi", "évolue", "evolue",
                        "analyse tout", "auto-améliore", "auto améliore",
                        "génère un skill complexe", "stratégie globale",
                        "planifie la semaine", "self_evolve"]

        if any(kw in tl for kw in critical_kws):
            complexity = "critical"
        elif estimated_steps >= 4 or word_count >= 25:
            complexity = "complex"
        elif estimated_steps >= 3 or word_count >= 12 or requires_code:
            complexity = "medium"
        else:
            complexity = "simple"

        # Web
        web_kws = ["site", "web", "url", "http", "google", "recherche",
                   "navigue", "formulaire", "connecte", "login", "scrape",
                   "extrait", "télécharge", "cherche en ligne", ".com", ".fr"]
        requires_browser = (task_type == "web") or any(kw in tl for kw in web_kws)

        # Type final
        if requires_browser:
            task_type_resolved = "web"
            requires_vision    = False
        elif requires_vision:
            task_type_resolved = "vision"
        elif requires_code:
            task_type_resolved = "code"
        elif complexity in ("complex", "critical"):
            task_type_resolved = "reasoning"
        else:
            task_type_resolved = task_type or "action"

        # Confiance
        if any(kw in tl for kw in ["exactement", "précisément"]):
            confidence = 0.95
        elif any(kw in tl for kw in ["essaie", "tente", "peut-être"]):
            confidence = 0.6
        else:
            confidence = 0.8

        return TaskProfile(
            complexity          = complexity,
            type                = task_type_resolved,
            requires_vision     = requires_vision,
            requires_code       = requires_code,
            estimated_steps     = estimated_steps,
            confidence_required = confidence,
        )

    # ─── Sélection du modèle ──────────────────────────────────────────────────

    def select_model(self, profile: TaskProfile) -> str:
        """Retourne le modèle optimal selon le profil de tâche."""
        fallback = self._ollama_fallback()
        mode     = self.routing_mode

        if mode == "claude_only":
            model, reason = "claude", "mode claude_only forcé"
        elif mode == "local_only":
            model, reason = self._select_local(profile, fallback)
        else:
            model, reason = self._select_smart(profile, fallback)

        if model not in self.available_models:
            # Tenter le fallback cloud → local
            fallback_model = FALLBACK_MAP.get(
                MODEL_REGISTRY.get(model, {}).get("ollama_name", ""), fallback
            )
            reason += f" → fallback {fallback_model} ({model} non disponible)"
            model   = fallback_model if fallback_model in self.available_models else fallback

        profile.selected_model = model
        profile.routing_reason = reason
        return model

    def _select_smart(self, profile: TaskProfile, fallback: str) -> tuple[str, str]:
        """Routage intelligent basé sur le type de tâche."""
        task_type_enum = TaskType.GENERAL

        # Déterminer le TaskType depuis le profil
        if profile.type == "vision" or profile.requires_vision:
            task_type_enum = TaskType.VISION
        elif profile.type == "code" or profile.requires_code:
            if "debug" in profile.type:
                task_type_enum = TaskType.DEBUG
            else:
                task_type_enum = TaskType.CODE
        elif profile.complexity == "critical":
            task_type_enum = TaskType.HEAVY
        elif profile.complexity == "complex":
            task_type_enum = TaskType.REASONING
        elif profile.complexity == "simple" and profile.estimated_steps == 1:
            task_type_enum = TaskType.FAST
        else:
            task_type_enum = TaskType.GENERAL

        model  = get_model_for_task(task_type_enum)
        reason = f"smart: {task_type_enum.value} → {model}"
        return model, reason

    def _select_local(self, profile: TaskProfile, fallback: str) -> tuple[str, str]:
        """Mode local_only : préfère les modèles locaux disponibles."""
        if profile.requires_vision:
            m = next(
                (k for k in ("llama3.2-vision", "llava", "moondream") if self._has(k)),
                fallback
            )
            return m, f"local: vision → {m}"
        if profile.requires_code:
            m = next(
                (k for k in ("qwen3-coder",) if self._has(k)),
                fallback
            )
            return m, f"local: code → {m}"
        if profile.complexity in ("complex", "critical"):
            m = "llama3" if self._has("llama3") else fallback
            return m, f"local: complex → {m}"
        m = "llama3.2:3b" if self._has("llama3.2:3b") else fallback
        return m, f"local: simple → {m}"

    def _ollama_fallback(self) -> str:
        """Modèle de secours local minimal."""
        for m in ("llama3.2:3b", "llama3", "llava"):
            if self._has(m):
                return m
        local = [
            m for m in self.available_models
            if MODEL_REGISTRY.get(m, {}).get("api") != "anthropic"
        ]
        return local[0] if local else os.getenv("OLLAMA_MODEL_DEFAULT", "llama3.2:3b")

    # ─── Appels LLM ───────────────────────────────────────────────────────────

    def call_model(self, model: str, prompt: str, system: str = "") -> str:
        """Dispatche vers Anthropic ou Ollama. Retourne le texte généré."""
        t0 = time.time()

        if model == "claude" and self.anthropic_key:
            result = self._call_claude(prompt, system)
        else:
            ollama_name = MODEL_REGISTRY.get(model, {}).get("ollama_name", model)
            result      = self._call_ollama(ollama_name, prompt, system)

        duration = time.time() - t0
        logging.info(f"[brain] {model} → {len(result)} chars ({duration:.1f}s)")
        return result

    def _call_claude(self, prompt: str, system: str) -> str:
        model_id = MODEL_REGISTRY["claude"]["model_id"]
        for attempt in range(2):
            try:
                import anthropic
                client = anthropic.Anthropic(api_key=self.anthropic_key)
                kwargs: dict[str, Any] = {
                    "model":      model_id,
                    "max_tokens": 4096,
                    "messages":   [{"role": "user", "content": prompt}],
                }
                if system:
                    kwargs["system"] = system
                resp = client.messages.create(**kwargs)
                return resp.content[0].text
            except Exception as exc:
                if attempt == 0:
                    time.sleep(2)
                    continue
                return f"[Claude erreur] {exc}"
        return "[Claude timeout]"

    def _call_claude_chat(self, messages: list[dict[str, str]], system: str) -> str:
        model_id = MODEL_REGISTRY["claude"]["model_id"]
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self.anthropic_key)
            kwargs: dict[str, Any] = {
                "model":      model_id,
                "max_tokens": 4096,
                "messages":   messages,
            }
            if system:
                kwargs["system"] = system
            resp = client.messages.create(**kwargs)
            return resp.content[0].text
        except Exception as exc:
            return f"[Claude chat erreur] {exc}"

    def _call_ollama(self, ollama_model: str, prompt: str, system: str) -> str:
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        for attempt in range(2):
            try:
                resp = requests.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model":   ollama_model,
                        "prompt":  full_prompt,
                        "stream":  False,
                        "options": {"temperature": 0.3, "num_predict": 2048},
                    },
                    timeout=_TIMEOUTS["medium"],
                )
                resp.raise_for_status()
                return resp.json().get("response", "")
            except requests.exceptions.Timeout:
                logging.warning(f"[brain] _call_ollama [{ollama_model}] timeout (tentative {attempt + 1})")
                if attempt == 0:
                    continue
                return f"[Timeout Ollama {ollama_model}]"
            except Exception as exc:
                logging.warning(f"[brain] _call_ollama [{ollama_model}] erreur : {exc}")
                if attempt == 0:
                    time.sleep(2)
                    continue
                return f"[Erreur Ollama {ollama_model}] {exc}"
        return "[Ollama indisponible]"


# ─── Route FastAPI ────────────────────────────────────────────────────────────

from fastapi import APIRouter

router = APIRouter(prefix="/model-router", tags=["model-router"])


@router.post("/route")
async def route_prompt(body: dict):
    """Détermine le meilleur modèle pour un prompt donné."""
    prompt = body.get("prompt", "")
    model, task_type = get_model_for_prompt(prompt)
    return {
        "model":          model,
        "task_type":      task_type,
        "prompt_preview": prompt[:100],
        "all_models":     {t.value: m for t, m in MODEL_MAP.items()},
    }


@router.get("/models")
async def list_model_map():
    """Liste le mapping complet tâche → modèle."""
    return {t.value: m for t, m in MODEL_MAP.items()}
