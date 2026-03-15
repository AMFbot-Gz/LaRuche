"""
tests/test_react_planner.py — Tests du ReActPlanner (Reason-Act-Observe).

Stratégie :
  - Tous les appels HTTP (Brain + Executor/Perception) sont mockés.
  - Aucun service externe n'est requis.

Couverture :
  - TestReActStep        — sérialisation d'un step en texte historique
  - TestReActPlannerParse — parsing de la réponse LLM (Thought/Action/Final Answer)
  - TestReActPlannerLoop  — boucle ReAct complète avec Brain + Executor mockés
  - TestReActEndpoint     — endpoint FastAPI POST /react
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from agents.orchestration.services.react_planner import ReActPlanner, ReActStep


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _make_brain_response(thought: str, action: dict | None = None, final_answer: str | None = None) -> MagicMock:
    """
    Construit un mock de réponse httpx pour Brain /think.

    Produit la réponse LLM attendue : Thought + Action OU Thought + Final Answer.
    """
    if final_answer is not None:
        llm_text = f"Thought: {thought}\nFinal Answer: {final_answer}"
    else:
        llm_text = f"Thought: {thought}\nAction: {json.dumps(action)}"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"response": llm_text}
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


def _make_skill_response(data: dict) -> MagicMock:
    """Construit un mock de réponse httpx pour un appel de skill."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = data
    return mock_resp


# ══════════════════════════════════════════════════════════════════════════════
# TestReActStep — sérialisation en texte historique
# ══════════════════════════════════════════════════════════════════════════════


class TestReActStep:
    def test_to_history_text_with_action_and_observation(self):
        """Un step complet doit sérialiser Thought, Action et Observation."""
        step = ReActStep(
            thought="Je dois lister les fichiers",
            action={"skill": "run_command", "params": {"command": "ls"}},
            observation='{"files": ["a.txt"]}',
        )
        text = step.to_history_text()
        assert "Thought: Je dois lister les fichiers" in text
        assert "Action:" in text
        assert "run_command" in text
        assert 'Observation: {"files": ["a.txt"]}' in text

    def test_to_history_text_without_action(self):
        """Un step Final Answer n'a pas d'Action ni d'Observation."""
        step = ReActStep(thought="Mission accomplie", action=None, observation=None)
        text = step.to_history_text()
        assert "Thought: Mission accomplie" in text
        assert "Action:" not in text
        assert "Observation:" not in text

    def test_to_history_text_action_json_valid(self):
        """L'Action doit être sérialisée en JSON valide dans le texte."""
        action = {"skill": "type_text", "params": {"text": "bonjour"}}
        step = ReActStep(thought="Taper du texte", action=action, observation="ok")
        text = step.to_history_text()
        action_line = [l for l in text.split("\n") if l.startswith("Action:")][0]
        parsed = json.loads(action_line[len("Action:"):].strip())
        assert parsed["skill"] == "type_text"
        assert parsed["params"]["text"] == "bonjour"


# ══════════════════════════════════════════════════════════════════════════════
# TestReActPlannerParse — parsing de la réponse LLM
# ══════════════════════════════════════════════════════════════════════════════


class TestReActPlannerParse:
    """Tests unitaires purs sur _parse_react_response (pas de réseau)."""

    @pytest.fixture
    def planner(self) -> ReActPlanner:
        return ReActPlanner()

    def test_parse_thought_and_action(self, planner: ReActPlanner):
        text = 'Thought: Je dois lancer ls\nAction: {"skill": "run_command", "params": {"command": "ls"}}'
        thought, action, final_answer = planner._parse_react_response(text)
        assert thought == "Je dois lancer ls"
        assert action == {"skill": "run_command", "params": {"command": "ls"}}
        assert final_answer is None

    def test_parse_thought_and_final_answer(self, planner: ReActPlanner):
        text = "Thought: J'ai terminé\nFinal Answer: Les fichiers sont listés"
        thought, action, final_answer = planner._parse_react_response(text)
        assert thought == "J'ai terminé"
        assert action is None
        assert final_answer == "Les fichiers sont listés"

    def test_parse_invalid_json_action_returns_unknown(self, planner: ReActPlanner):
        """Un JSON Action invalide doit retourner skill='unknown' sans crash."""
        text = "Thought: Essai\nAction: pas du json valide !"
        _, action, _ = planner._parse_react_response(text)
        assert action is not None
        assert action["skill"] == "unknown"

    def test_parse_empty_string_returns_defaults(self, planner: ReActPlanner):
        """Une réponse vide retourne des valeurs vides sans crash."""
        thought, action, final_answer = planner._parse_react_response("")
        assert thought == ""
        assert action is None
        assert final_answer is None

    def test_parse_multiline_thought_takes_last(self, planner: ReActPlanner):
        """Si plusieurs lignes Thought: existent, la dernière est prise."""
        text = "Thought: Premier\nThought: Deuxième\nFinal Answer: Résultat"
        thought, _, final_answer = planner._parse_react_response(text)
        assert thought == "Deuxième"
        assert final_answer == "Résultat"

    def test_parse_action_with_nested_params(self, planner: ReActPlanner):
        """Les params imbriqués doivent être correctement parsés."""
        action_dict = {"skill": "write_file", "params": {"path": "/tmp/test.txt", "content": "hello"}}
        text = f'Thought: Écrire un fichier\nAction: {json.dumps(action_dict)}'
        _, action, _ = planner._parse_react_response(text)
        assert action["params"]["path"] == "/tmp/test.txt"
        assert action["params"]["content"] == "hello"


# ══════════════════════════════════════════════════════════════════════════════
# TestReActPlannerLoop — boucle ReAct avec Brain + Executor mockés
# ══════════════════════════════════════════════════════════════════════════════


class TestReActPlannerLoop:
    """Tests de la boucle execute() avec mocks httpx."""

    @pytest.fixture
    def planner(self) -> ReActPlanner:
        return ReActPlanner(max_steps=5, brain_url="http://localhost:8003")

    @pytest.mark.asyncio
    async def test_execute_final_answer_on_first_step(self, planner: ReActPlanner):
        """Si le LLM répond directement avec Final Answer, success=True en 1 step."""
        brain_mock = _make_brain_response(
            thought="Le goal est simple, je réponds directement",
            final_answer="Voici la réponse",
        )

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = brain_mock
            result = await planner.execute(goal="Dis bonjour")

        assert result["success"] is True
        assert result["result"] == "Voici la réponse"
        assert result["steps"] == 1
        assert len(result["history"]) == 1

    @pytest.mark.asyncio
    async def test_execute_action_then_final_answer(self, planner: ReActPlanner):
        """
        Cycle : Brain → Action → Observation → Brain → Final Answer.
        Vérifie que l'historique contient bien 2 steps.
        """
        brain_action = _make_brain_response(
            thought="Je dois lister les fichiers",
            action={"skill": "run_command", "params": {"command": "ls /tmp"}},
        )
        brain_final = _make_brain_response(
            thought="J'ai les fichiers",
            final_answer="Les fichiers sont : a.txt, b.txt",
        )
        skill_mock = _make_skill_response({"stdout": "a.txt\nb.txt", "return_code": 0})

        call_count = 0

        async def mock_post_side_effect(url, **kwargs):
            nonlocal call_count
            if "/think" in str(url):
                call_count += 1
                return brain_action if call_count == 1 else brain_final
            # Appel skill executor
            return skill_mock

        with patch("httpx.AsyncClient.post", side_effect=mock_post_side_effect), \
             patch("httpx.AsyncClient.request", new_callable=AsyncMock) as mock_request:
            mock_request.return_value = skill_mock
            # Remplacer _call_brain pour simuler l'alternance
            brain_responses = [
                f"Thought: Je dois lister les fichiers\nAction: {json.dumps({'skill': 'run_command', 'params': {'command': 'ls /tmp'}})}",
                "Thought: J'ai les fichiers\nFinal Answer: Les fichiers sont : a.txt, b.txt",
            ]
            call_idx = 0

            async def mock_call_brain(prompt: str):
                nonlocal call_idx
                resp = brain_responses[min(call_idx, len(brain_responses) - 1)]
                call_idx += 1
                return resp

            planner._call_brain = mock_call_brain
            result = await planner.execute(goal="Liste les fichiers dans /tmp")

        assert result["success"] is True
        assert "a.txt" in result["result"] or "fichiers" in result["result"]
        assert result["steps"] == 2

    @pytest.mark.asyncio
    async def test_execute_brain_unavailable_returns_failure(self, planner: ReActPlanner):
        """Si le Brain est indisponible dès le 1er appel, retourner success=False."""
        async def mock_call_brain(prompt: str):
            return None  # Brain indisponible

        planner._call_brain = mock_call_brain
        result = await planner.execute(goal="Faire quelque chose")

        assert result["success"] is False
        assert "Brain indisponible" in result["result"]
        assert result["steps"] == 0

    @pytest.mark.asyncio
    async def test_execute_max_steps_reached(self, planner: ReActPlanner):
        """Sans Final Answer, la boucle s'arrête à max_steps et retourne success=False."""
        # Le LLM retourne toujours une Action, jamais de Final Answer
        always_action = f"Thought: Réflexion\nAction: {json.dumps({'skill': 'run_command', 'params': {'command': 'ls'}})}"
        skill_ok = '{"stdout": "ok", "return_code": 0}'

        async def mock_call_brain(prompt: str):
            return always_action

        async def mock_execute_skill(action):
            return skill_ok

        planner._call_brain    = mock_call_brain
        planner._execute_skill = mock_execute_skill
        planner.max_steps = 3

        result = await planner.execute(goal="Boucle infinie")

        assert result["success"] is False
        assert "max_steps" in result["result"]
        assert result["steps"] == 3
        assert len(result["history"]) == 3

    @pytest.mark.asyncio
    async def test_execute_unknown_skill_returns_error_observation(self, planner: ReActPlanner):
        """Un skill inconnu doit produire une observation d'erreur, pas un crash."""
        responses = [
            f"Thought: Essai skill inconnu\nAction: {json.dumps({'skill': 'teleportation', 'params': {}})}",
            "Thought: Le skill n'existe pas\nFinal Answer: Impossible d'exécuter ce skill",
        ]
        call_idx = 0

        async def mock_call_brain(prompt: str):
            nonlocal call_idx
            resp = responses[min(call_idx, len(responses) - 1)]
            call_idx += 1
            return resp

        planner._call_brain = mock_call_brain
        result = await planner.execute(goal="Téléporter quelque chose")

        # L'observation du step 1 doit mentionner le skill inconnu
        assert result["history"][0]["observation"] is not None
        assert "teleportation" in result["history"][0]["observation"] or "inconnu" in result["history"][0]["observation"]
        assert result["success"] is True  # Final Answer atteint au step 2

    @pytest.mark.asyncio
    async def test_execute_history_contains_all_steps(self, planner: ReActPlanner):
        """L'historique retourné doit contenir thought, action et observation pour chaque step."""
        responses = [
            f"Thought: Action 1\nAction: {json.dumps({'skill': 'run_command', 'params': {'command': 'pwd'}})}",
            f"Thought: Action 2\nAction: {json.dumps({'skill': 'run_command', 'params': {'command': 'whoami'}})}",
            "Thought: Terminé\nFinal Answer: Done",
        ]
        call_idx = 0

        async def mock_call_brain(prompt: str):
            nonlocal call_idx
            resp = responses[min(call_idx, len(responses) - 1)]
            call_idx += 1
            return resp

        async def mock_execute_skill(action):
            return '{"stdout": "result", "return_code": 0}'

        planner._call_brain    = mock_call_brain
        planner._execute_skill = mock_execute_skill
        planner.max_steps = 5

        result = await planner.execute(goal="Faire deux actions puis terminer")

        # 2 steps action + 1 step Final Answer = 3 entrées dans history
        assert len(result["history"]) == 3
        # Les 2 premiers ont action et observation
        for step in result["history"][:2]:
            assert "thought" in step
            assert "action" in step
            assert "observation" in step
            assert step["action"] is not None
            assert step["observation"] is not None
        # Le dernier (Final Answer) a thought mais pas d'action
        assert result["history"][2]["action"] is None

    @pytest.mark.asyncio
    async def test_execute_custom_skills_passed_to_brain(self, planner: ReActPlanner):
        """Les skills personnalisés doivent apparaître dans le prompt envoyé au Brain."""
        custom_skills = [{"name": "custom_skill", "description": "Mon skill", "params": {}}]
        received_prompts = []

        async def mock_call_brain(prompt: str):
            received_prompts.append(prompt)
            return "Thought: Terminé\nFinal Answer: OK"

        planner._call_brain = mock_call_brain
        await planner.execute(goal="Utiliser le skill custom", skills=custom_skills)

        assert len(received_prompts) == 1
        assert "custom_skill" in received_prompts[0]


# ══════════════════════════════════════════════════════════════════════════════
# TestReActEndpoint — endpoint FastAPI POST /react
# ══════════════════════════════════════════════════════════════════════════════


class TestReActEndpoint:
    """Tests de l'endpoint /react via le TestClient FastAPI."""

    @pytest.fixture
    def client(self):
        from agents.orchestration.orchestration_agent import app
        return TestClient(app)

    def test_react_success(self, client):
        """POST /react doit retourner 200 avec success=True si Final Answer obtenu."""
        mock_result = {
            "success": True,
            "result":  "Mission accomplie",
            "steps":   1,
            "history": [{"thought": "Facile", "action": None, "observation": None}],
        }

        with patch(
            "agents.orchestration.orchestration_agent.ReActPlanner.execute",
            new_callable=AsyncMock,
        ) as mock_execute:
            mock_execute.return_value = mock_result
            resp = client.post("/react", params={"goal": "Dis bonjour", "max_steps": 5})

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["result"] == "Mission accomplie"
        assert data["steps"] == 1

    def test_react_failure_brain_down(self, client):
        """POST /react doit retourner 200 avec success=False si Brain indisponible."""
        mock_result = {
            "success": False,
            "result":  "Brain indisponible — impossible de continuer le ReAct loop",
            "steps":   0,
            "history": [],
        }

        with patch(
            "agents.orchestration.orchestration_agent.ReActPlanner.execute",
            new_callable=AsyncMock,
        ) as mock_execute:
            mock_execute.return_value = mock_result
            resp = client.post("/react", params={"goal": "Test Brain down"})

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "Brain" in data["result"]

    def test_react_default_max_steps(self, client):
        """max_steps doit être 10 par défaut."""
        captured_kwargs: dict = {}

        async def mock_execute(self_inner, goal, skills=None):
            captured_kwargs["max_steps"] = self_inner.max_steps
            return {"success": True, "result": "ok", "steps": 1, "history": []}

        with patch(
            "agents.orchestration.orchestration_agent.ReActPlanner.execute",
            new=mock_execute,
        ):
            client.post("/react", params={"goal": "Test défaut"})

        assert captured_kwargs.get("max_steps", 10) == 10

    def test_react_returns_history(self, client):
        """La réponse doit inclure l'historique des steps."""
        mock_result = {
            "success": True,
            "result":  "Résultat final",
            "steps":   2,
            "history": [
                {"thought": "Pensée 1", "action": {"skill": "run_command", "params": {}}, "observation": "ok"},
                {"thought": "Pensée 2", "action": None, "observation": None},
            ],
        }

        with patch(
            "agents.orchestration.orchestration_agent.ReActPlanner.execute",
            new_callable=AsyncMock,
        ) as mock_execute:
            mock_execute.return_value = mock_result
            resp = client.post("/react", params={"goal": "Tâche en 2 étapes"})

        data = resp.json()
        assert "history" in data
        assert len(data["history"]) == 2
        assert data["history"][0]["thought"] == "Pensée 1"

    def test_react_missing_goal_returns_422(self, client):
        """POST /react sans goal doit retourner 422 (validation FastAPI)."""
        resp = client.post("/react")
        assert resp.status_code == 422
