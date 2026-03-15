"""
react_planner.py — ReAct (Reason-Act-Observe) ActionPlanner

Pattern : Think → Act → Observe → Repeat jusqu'à goal atteint ou max_steps.

Le LLM reçoit :
  - Le goal
  - Les skills disponibles (avec descriptions + params_schema)
  - L'historique des steps précédents (Thought/Action/Observation)

Il retourne :
  - Thought : raisonnement interne
  - Action : { skill_name, params }
  OU
  - Final Answer : résultat final si goal atteint
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx


# ─── Configuration ────────────────────────────────────────────────────────────

BRAIN_URL    = os.getenv("AGENT_BRAIN_URL",    "http://localhost:8003")
EXECUTOR_URL = os.getenv("AGENT_EXECUTOR_URL", "http://localhost:8004")

REACT_SYSTEM_PROMPT = """Tu es un agent ReAct. Pour accomplir le goal, tu utilises ce format strict :

Thought: [ton raisonnement sur ce qu'il faut faire]
Action: {{"skill": "nom_du_skill", "params": {{...}}}}

Ou si le goal est atteint :
Thought: [ton raisonnement final]
Final Answer: [résultat final concis]

Skills disponibles :
{skills_json}

Historique des actions précédentes :
{history}

Goal actuel : {goal}

Réponds UNIQUEMENT avec le format Thought/Action ou Thought/Final Answer."""

# Skills natifs Chimera exposés dans le ReAct loop
AVAILABLE_SKILLS: list[dict[str, Any]] = [
    {
        "name":        "screenshot",
        "description": "Capture l'écran",
        "params":      {},
    },
    {
        "name":        "mouse_click",
        "description": "Clique aux coordonnées x,y",
        "params":      {"x": "int", "y": "int"},
    },
    {
        "name":        "type_text",
        "description": "Tape du texte",
        "params":      {"text": "str"},
    },
    {
        "name":        "key_press",
        "description": "Presse une touche",
        "params":      {"key": "str"},
    },
    {
        "name":        "run_command",
        "description": "Exécute une commande shell",
        "params":      {"command": "str"},
    },
    {
        "name":        "open_app",
        "description": "Ouvre une application macOS",
        "params":      {"app_name": "str"},
    },
    {
        "name":        "read_file",
        "description": "Lit un fichier",
        "params":      {"path": "str"},
    },
    {
        "name":        "write_file",
        "description": "Écrit dans un fichier",
        "params":      {"path": "str", "content": "str"},
    },
]

# Mapping skill → (port, méthode HTTP, endpoint)
# Les skills sans port spécifique passent par l'Executor (:8004)
_SKILL_ROUTES: dict[str, tuple[int, str, str]] = {
    "screenshot":  (8002, "POST", "/screenshot"),
    "mouse_click": (8004, "POST", "/mouse_click"),
    "type_text":   (8004, "POST", "/type_text"),
    "key_press":   (8004, "POST", "/key_press"),
    "run_command": (8004, "POST", "/run_command"),
    "open_app":    (8004, "POST", "/open_app"),
    "read_file":   (8004, "POST", "/read_file"),
    "write_file":  (8004, "POST", "/write_file"),
}


# ─── Structures de données ────────────────────────────────────────────────────


class ReActStep:
    """
    Représente un cycle Think→Act→Observe du loop ReAct.

    Attributes:
        thought:     Raisonnement interne du LLM.
        action:      Dict {"skill": ..., "params": ...} ou None si Final Answer.
        observation: Résultat brut retourné par l'exécution du skill.
    """

    def __init__(
        self,
        thought:     str,
        action:      dict[str, Any] | None,
        observation: str | None,
    ) -> None:
        self.thought     = thought
        self.action      = action
        self.observation = observation

    def to_history_text(self) -> str:
        """Sérialise le step en texte lisible pour le prochain prompt LLM."""
        lines = [f"Thought: {self.thought}"]
        if self.action is not None:
            lines.append(f"Action: {json.dumps(self.action, ensure_ascii=False)}")
        if self.observation is not None:
            lines.append(f"Observation: {self.observation}")
        return "\n".join(lines)


# ─── Planner principal ────────────────────────────────────────────────────────


class ReActPlanner:
    """
    Implémente le loop ReAct pour atteindre un goal en appelant des skills.

    À chaque itération :
      1. Construit le prompt avec l'historique des steps précédents
      2. Appelle Brain /think pour obtenir Thought + Action (ou Final Answer)
      3. Exécute le skill via l'agent approprié
      4. Stocke l'observation et boucle

    Termine quand le LLM émet "Final Answer:" ou quand max_steps est atteint.
    """

    def __init__(
        self,
        max_steps: int = 10,
        brain_url: str | None = None,
    ) -> None:
        self.max_steps = max_steps
        self._brain_url = brain_url or BRAIN_URL

    async def execute(
        self,
        goal:   str,
        skills: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Exécute le ReAct loop pour atteindre le goal.

        Args:
            goal:   Objectif en langage naturel à accomplir.
            skills: Liste de skill descriptors à exposer au LLM.
                    Utilise AVAILABLE_SKILLS si non fourni.

        Returns:
            {
              "success": bool,
              "result":  str,          # Final Answer ou message d'erreur
              "steps":   int,          # Nombre de cycles exécutés
              "history": list[dict],   # Trace complète (thought/action/observation)
            }
        """
        if skills is None:
            skills = AVAILABLE_SKILLS

        history: list[ReActStep] = []

        for step_num in range(self.max_steps):
            # ── Construire le prompt avec l'historique complet ────────────────
            history_text = (
                "\n\n".join(s.to_history_text() for s in history)
                if history
                else "Aucune action précédente."
            )

            prompt = REACT_SYSTEM_PROMPT.format(
                skills_json=json.dumps(skills, ensure_ascii=False, indent=2),
                history=history_text,
                goal=goal,
            )

            # ── Appel Brain /think ────────────────────────────────────────────
            llm_response = await self._call_brain(prompt)
            if llm_response is None:
                return {
                    "success": False,
                    "result":  "Brain indisponible — impossible de continuer le ReAct loop",
                    "steps":   step_num,
                    "history": self._serialize_history(history),
                }

            # ── Parser Thought / Action / Final Answer ────────────────────────
            thought, action, final_answer = self._parse_react_response(llm_response)

            # ── Final Answer → terminé ────────────────────────────────────────
            if final_answer is not None:
                history.append(ReActStep(thought, None, None))
                return {
                    "success": True,
                    "result":  final_answer,
                    "steps":   step_num + 1,
                    "history": self._serialize_history(history),
                }

            # ── Exécuter le skill et récupérer l'observation ──────────────────
            observation = await self._execute_skill(action)
            history.append(ReActStep(thought, action, observation))

        # max_steps atteint sans Final Answer
        return {
            "success": False,
            "result":  f"max_steps ({self.max_steps}) atteint sans Final Answer",
            "steps":   self.max_steps,
            "history": self._serialize_history(history),
        }

    # ─── Helpers privés ───────────────────────────────────────────────────────

    async def _call_brain(self, prompt: str) -> str | None:
        """
        Envoie le prompt au Brain /think.

        Retourne la réponse textuelle du LLM, ou None si le Brain est indisponible.
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self._brain_url}/think",
                    json={"prompt": prompt, "task_type": "reasoning"},
                )
                resp.raise_for_status()
                return resp.json().get("response", "")
        except Exception:
            return None

    def _parse_react_response(
        self,
        text: str,
    ) -> tuple[str, dict[str, Any] | None, str | None]:
        """
        Parse la réponse LLM en (thought, action, final_answer).

        Format attendu (ligne par ligne) :
          Thought: <raisonnement>
          Action: {"skill": "...", "params": {...}}
          OU
          Final Answer: <résultat>

        Robustesse :
          - Ignore les lignes non reconnues
          - Action JSON invalide → action avec skill="unknown"
          - Si aucun Thought trouvé, thought reste ""
        """
        thought      = ""
        action       = None
        final_answer = None

        for line in text.split("\n"):
            stripped = line.strip()

            if stripped.startswith("Thought:"):
                thought = stripped[len("Thought:"):].strip()

            elif stripped.startswith("Action:"):
                raw_json = stripped[len("Action:"):].strip()
                try:
                    action = json.loads(raw_json)
                except json.JSONDecodeError:
                    action = {"skill": "unknown", "params": {}}

            elif stripped.startswith("Final Answer:"):
                final_answer = stripped[len("Final Answer:"):].strip()

        return thought, action, final_answer

    async def _execute_skill(self, action: dict[str, Any] | None) -> str:
        """
        Dispatche le skill vers l'agent compétent et retourne l'observation brute.

        Tronque la réponse à 500 caractères pour ne pas saturer le prochain prompt.
        Ne lève jamais d'exception : retourne un message d'erreur lisible.
        """
        if not action:
            return "Aucune action à exécuter."

        skill  = action.get("skill", "")
        params = action.get("params", {})
        if not isinstance(params, dict):
            params = {}

        route = _SKILL_ROUTES.get(skill)
        if route is None:
            return f"Skill inconnu : '{skill}'. Skills disponibles : {list(_SKILL_ROUTES.keys())}"

        port, method, path = route
        url = f"http://localhost:{port}{path}"

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.request(method, url, json=params)
                data = resp.json()
                # Limiter la taille de l'observation pour le prochain prompt
                observation = json.dumps(data, ensure_ascii=False)
                return observation[:500]
        except Exception as exc:
            return f"Erreur lors de l'exécution de '{skill}' sur {url} : {exc}"

    def _serialize_history(
        self,
        history: list[ReActStep],
    ) -> list[dict[str, Any]]:
        """Convertit la liste de ReActStep en liste de dicts sérialisables."""
        return [
            {
                "thought":     step.thought,
                "action":      step.action,
                "observation": step.observation,
            }
            for step in history
        ]
