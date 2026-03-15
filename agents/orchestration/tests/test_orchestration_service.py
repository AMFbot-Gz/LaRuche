"""
tests/test_orchestration_service.py — Tests de l'Orchestration Agent.

Stratégie :
- Mock AgentDispatcher.dispatch pour éviter les appels HTTP réels.
- Mock MissionPlanner.plan pour des plans prévisibles.
- 25+ tests couvrant endpoints, edge cases et logique métier.
"""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Import de l'app et des singletons à mocker
from agents.orchestration.orchestration_agent import app, _missions
from agents.orchestration.schemas.orchestration_schemas import (
    MissionRecord,
    MissionStep,
)
from agents.orchestration.services.agent_dispatcher import AgentDispatcher
from agents.orchestration.services.mission_planner import MissionPlanner


# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def clear_missions():
    """Vide le store in-memory avant chaque test."""
    _missions.clear()
    yield
    _missions.clear()


@pytest.fixture
def client():
    return TestClient(app)


def _make_step(agent: str = "brain", endpoint: str = "/think", status: str = "pending") -> MissionStep:
    return MissionStep(
        id=str(uuid.uuid4()),
        agent=agent,
        endpoint=endpoint,
        payload={"prompt": "test"},
        status=status,
    )


def _success_dispatch(data: dict | None = None):
    """Retourne un mock dispatch qui réussit."""
    return AsyncMock(return_value={"success": True, "data": data or {"response": "ok"}, "duration_ms": 10})


def _fail_dispatch(error: str = "Connection refused"):
    """Retourne un mock dispatch qui échoue."""
    return AsyncMock(return_value={"success": False, "data": {}, "error": error, "duration_ms": 5})


# ─── Tests /health ───────────────────────────────────────────────────────────


class TestHealth:
    def test_health_returns_200(self, client):
        """GET /health doit retourner 200."""
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_contains_required_fields(self, client):
        """GET /health doit contenir status, service, timestamp, available_agents, missions_running."""
        resp = client.get("/health")
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "orchestration"
        assert "timestamp" in data
        assert "available_agents" in data
        assert "missions_running" in data

    def test_health_lists_known_agents(self, client):
        """GET /health doit lister les agents connus."""
        resp = client.get("/health")
        agents = resp.json()["available_agents"]
        assert "brain" in agents
        assert "executor" in agents
        assert "memory" in agents

    def test_health_missions_running_zero_initially(self, client):
        """missions_running doit être 0 au démarrage."""
        resp = client.get("/health")
        assert resp.json()["missions_running"] == 0

    def test_health_missions_running_counts_running(self, client):
        """missions_running doit compter les missions en cours."""
        _missions["m1"] = MissionRecord(
            mission_id="m1", objective="test", status="running", started_at="now"
        )
        resp = client.get("/health")
        assert resp.json()["missions_running"] == 1


# ─── Tests /status ────────────────────────────────────────────────────────────


class TestStatus:
    def test_status_returns_200(self, client):
        """GET /status doit retourner 200."""
        with patch.object(AgentDispatcher, "check_health", new_callable=AsyncMock) as mock_health:
            mock_health.return_value = {"brain": True, "executor": False, "memory": True,
                                        "perception": False, "evolution": False}
            resp = client.get("/status")
        assert resp.status_code == 200

    def test_status_contains_agents_field(self, client):
        """GET /status doit contenir le champ agents."""
        with patch.object(AgentDispatcher, "check_health", new_callable=AsyncMock) as mock_health:
            mock_health.return_value = {"brain": True, "executor": False, "memory": False,
                                        "perception": False, "evolution": False}
            resp = client.get("/status")
        data = resp.json()
        assert "agents" in data
        assert "agents_online" in data
        assert "missions_total" in data

    def test_status_agents_online_count(self, client):
        """agents_online doit refléter le nombre d'agents avec True."""
        with patch.object(AgentDispatcher, "check_health", new_callable=AsyncMock) as mock_health:
            mock_health.return_value = {"brain": True, "executor": True, "memory": False,
                                        "perception": False, "evolution": False}
            resp = client.get("/status")
        assert resp.json()["agents_online"] == 2

    def test_status_includes_missions_list(self, client):
        """GET /status doit inclure la liste des missions."""
        with patch.object(AgentDispatcher, "check_health", new_callable=AsyncMock) as mock_health:
            mock_health.return_value = {}
            resp = client.get("/status")
        assert "missions" in resp.json()


# ─── Tests /missions ──────────────────────────────────────────────────────────


class TestMissions:
    def test_missions_empty_at_start(self, client):
        """GET /missions doit retourner une liste vide au démarrage."""
        resp = client.get("/missions")
        assert resp.status_code == 200
        assert resp.json()["missions"] == []
        assert resp.json()["total"] == 0

    def test_missions_lists_stored_missions(self, client):
        """GET /missions doit lister les missions enregistrées."""
        _missions["abc"] = MissionRecord(
            mission_id="abc", objective="test obj", status="completed", started_at="now"
        )
        resp = client.get("/missions")
        data = resp.json()
        assert data["total"] == 1
        assert data["missions"][0]["mission_id"] == "abc"

    def test_missions_total_matches_count(self, client):
        """total doit correspondre au nombre de missions."""
        for i in range(3):
            _missions[f"m{i}"] = MissionRecord(
                mission_id=f"m{i}", objective=f"obj {i}", status="done", started_at="now"
            )
        resp = client.get("/missions")
        assert resp.json()["total"] == 3


# ─── Tests /missions/{id} ─────────────────────────────────────────────────────


class TestMissionById:
    def test_get_mission_existing(self, client):
        """GET /missions/{id} doit retourner la mission si elle existe."""
        _missions["xyz"] = MissionRecord(
            mission_id="xyz", objective="find files", status="completed", started_at="2026-01-01"
        )
        resp = client.get("/missions/xyz")
        assert resp.status_code == 200
        assert resp.json()["mission_id"] == "xyz"
        assert resp.json()["objective"] == "find files"

    def test_get_mission_unknown_returns_404(self, client):
        """GET /missions/{id} doit retourner 404 pour un ID inconnu."""
        resp = client.get("/missions/does-not-exist")
        assert resp.status_code == 404

    def test_get_mission_404_detail(self, client):
        """Le message d'erreur 404 doit mentionner l'ID."""
        resp = client.get("/missions/ghost-id")
        assert "ghost-id" in resp.json()["detail"]


# ─── Tests /delegate ─────────────────────────────────────────────────────────


class TestDelegate:
    def test_delegate_happy_path(self, client):
        """POST /delegate doit retourner success=True si l'agent répond."""
        with patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_dispatch.return_value = {
                "success": True,
                "data": {"response": "Bonjour"},
                "duration_ms": 42,
            }
            resp = client.post("/delegate", json={
                "agent": "brain",
                "endpoint": "/think",
                "payload": {"prompt": "Bonjour"},
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["agent"] == "brain"
        assert data["data"] == {"response": "Bonjour"}
        assert data["duration_ms"] == 42

    def test_delegate_agent_unavailable(self, client):
        """POST /delegate doit retourner success=False si l'agent est indisponible, pas de 503."""
        with patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_dispatch.return_value = {
                "success": False,
                "data": {},
                "error": "Connection refused",
                "duration_ms": 5,
            }
            resp = client.post("/delegate", json={
                "agent": "executor",
                "endpoint": "/run_command",
                "payload": {"command": "ls"},
            })
        assert resp.status_code == 200  # Pas de 503 !
        data = resp.json()
        assert data["success"] is False
        assert data["error"] == "Connection refused"

    def test_delegate_returns_error_field(self, client):
        """DelegateResponse doit avoir error=None en cas de succès."""
        with patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_dispatch.return_value = {
                "success": True,
                "data": {"ok": True},
                "duration_ms": 10,
            }
            resp = client.post("/delegate", json={
                "agent": "memory",
                "endpoint": "/memories",
                "payload": {},
            })
        assert resp.json()["error"] is None

    def test_delegate_includes_endpoint_in_response(self, client):
        """DelegateResponse doit inclure l'endpoint appelé."""
        with patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_dispatch.return_value = {"success": True, "data": {}, "duration_ms": 1}
            resp = client.post("/delegate", json={
                "agent": "brain",
                "endpoint": "/think",
                "payload": {},
            })
        assert resp.json()["endpoint"] == "/think"


# ─── Tests /orchestrate ───────────────────────────────────────────────────────


class TestOrchestrate:
    def test_orchestrate_returns_200(self, client):
        """POST /orchestrate doit retourner 200."""
        plan = [_make_step("brain", "/think")]
        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan, \
             patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_plan.return_value = plan
            mock_dispatch.return_value = {"success": True, "data": {"response": "ok"}, "duration_ms": 10}
            resp = client.post("/orchestrate", json={"objective": "Organise les fichiers"})
        assert resp.status_code == 200

    def test_orchestrate_completed_status(self, client):
        """Une mission avec toutes les étapes réussies → status=completed."""
        plan = [_make_step("brain", "/think"), _make_step("memory", "/memories")]
        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan, \
             patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_plan.return_value = plan
            mock_dispatch.return_value = {"success": True, "data": {}, "duration_ms": 5}
            resp = client.post("/orchestrate", json={"objective": "Test mission"})
        assert resp.json()["status"] == "completed"

    def test_orchestrate_failed_status_all_steps_fail(self, client):
        """Une mission avec toutes les étapes échouées → status=failed."""
        plan = [_make_step("executor", "/run_command")]
        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan, \
             patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_plan.return_value = plan
            mock_dispatch.return_value = {"success": False, "data": {}, "error": "down", "duration_ms": 5}
            resp = client.post("/orchestrate", json={"objective": "Test fail"})
        assert resp.json()["status"] == "failed"

    def test_orchestrate_partial_status(self, client):
        """Une mission avec des étapes mixtes → status=partial."""
        plan = [_make_step("brain", "/think"), _make_step("executor", "/run_command")]
        results = [
            {"success": True,  "data": {}, "duration_ms": 5},
            {"success": False, "data": {}, "error": "down", "duration_ms": 5},
        ]
        call_count = 0

        async def side_effect(*args, **kwargs):
            nonlocal call_count
            result = results[min(call_count, len(results) - 1)]
            call_count += 1
            return result

        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan, \
             patch.object(AgentDispatcher, "dispatch", side_effect=side_effect):
            mock_plan.return_value = plan
            resp = client.post("/orchestrate", json={"objective": "Test partial"})
        assert resp.json()["status"] == "partial"

    def test_orchestrate_stores_mission(self, client):
        """La mission doit être stockée dans _missions après orchestration."""
        plan = [_make_step()]
        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan, \
             patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_plan.return_value = plan
            mock_dispatch.return_value = {"success": True, "data": {}, "duration_ms": 1}
            resp = client.post("/orchestrate", json={"objective": "Store test"})
        mission_id = resp.json()["mission_id"]
        assert mission_id in _missions

    def test_orchestrate_returns_mission_id(self, client):
        """La réponse doit inclure un mission_id."""
        plan = [_make_step()]
        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan, \
             patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_plan.return_value = plan
            mock_dispatch.return_value = {"success": True, "data": {}, "duration_ms": 1}
            resp = client.post("/orchestrate", json={"objective": "ID test"})
        assert "mission_id" in resp.json()
        assert len(resp.json()["mission_id"]) > 0

    def test_orchestrate_includes_steps(self, client):
        """La réponse doit inclure les étapes exécutées."""
        plan = [_make_step("brain", "/think")]
        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan, \
             patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_plan.return_value = plan
            mock_dispatch.return_value = {"success": True, "data": {}, "duration_ms": 1}
            resp = client.post("/orchestrate", json={"objective": "Steps test"})
        assert len(resp.json()["steps"]) == 1

    def test_orchestrate_empty_plan_fails(self, client):
        """Un plan vide → status=failed."""
        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan:
            mock_plan.return_value = []
            resp = client.post("/orchestrate", json={"objective": "Empty plan"})
        assert resp.json()["status"] == "failed"

    def test_orchestrate_summary_is_string(self, client):
        """Le résumé doit être une chaîne non vide."""
        plan = [_make_step()]
        with patch.object(MissionPlanner, "plan", new_callable=AsyncMock) as mock_plan, \
             patch.object(AgentDispatcher, "dispatch", new_callable=AsyncMock) as mock_dispatch:
            mock_plan.return_value = plan
            mock_dispatch.return_value = {"success": True, "data": {}, "duration_ms": 1}
            resp = client.post("/orchestrate", json={"objective": "Summary test"})
        assert isinstance(resp.json()["summary"], str)
        assert len(resp.json()["summary"]) > 0


# ─── Tests AgentDispatcher ────────────────────────────────────────────────────


class TestAgentDispatcher:
    @pytest.mark.asyncio
    async def test_dispatch_unknown_agent(self):
        """dispatch vers un agent inconnu → success=False sans exception."""
        dispatcher = AgentDispatcher()
        result = await dispatcher.dispatch("unknown_agent", "/foo", {})
        assert result["success"] is False
        assert "inconnu" in result["error"].lower() or "unknown" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_dispatch_timeout(self):
        """dispatch avec timeout → success=False avec message timeout."""
        import httpx
        dispatcher = AgentDispatcher()
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = httpx.TimeoutException("timeout")
            result = await dispatcher.dispatch("brain", "/think", {}, timeout=1)
        assert result["success"] is False
        assert "timeout" in result["error"].lower() or "Timeout" in result["error"]

    @pytest.mark.asyncio
    async def test_dispatch_network_error(self):
        """dispatch avec erreur réseau → success=False sans exception."""
        dispatcher = AgentDispatcher()
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = ConnectionRefusedError("refused")
            result = await dispatcher.dispatch("brain", "/think", {})
        assert result["success"] is False
        assert result["data"] == {}

    @pytest.mark.asyncio
    async def test_check_health_returns_dict(self):
        """check_health doit retourner un dict avec tous les agents connus."""
        dispatcher = AgentDispatcher()
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_get.return_value = mock_response
            result = await dispatcher.check_health()
        assert isinstance(result, dict)
        assert set(result.keys()) == set(AgentDispatcher.AGENT_URLS.keys())

    @pytest.mark.asyncio
    async def test_check_health_agent_down(self):
        """check_health → False si l'agent ne répond pas."""
        dispatcher = AgentDispatcher()
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = ConnectionRefusedError("refused")
            result = await dispatcher.check_health()
        assert all(v is False for v in result.values())


# ─── Tests MissionPlanner ─────────────────────────────────────────────────────


class TestMissionPlanner:
    @pytest.mark.asyncio
    async def test_plan_fallback_when_brain_unavailable(self):
        """plan doit retourner un fallback si Brain est indisponible."""
        planner = MissionPlanner(brain_url="http://localhost:19999")
        steps = await planner.plan("test objective")
        # Fallback = au moins 1 étape
        assert len(steps) >= 1

    @pytest.mark.asyncio
    async def test_plan_fallback_step_targets_brain(self):
        """Le fallback doit cibler le Brain."""
        planner = MissionPlanner(brain_url="http://localhost:19999")
        steps = await planner.plan("find files")
        assert steps[0].agent == "brain"
        assert steps[0].endpoint == "/think"

    @pytest.mark.asyncio
    async def test_plan_parses_valid_llm_response(self):
        """_parse_steps doit parser un JSON valide."""
        planner = MissionPlanner()
        json_response = '''[
            {"agent": "executor", "endpoint": "/run_command", "payload": {"command": "ls"}, "description": "test"},
            {"agent": "memory",   "endpoint": "/memories",    "payload": {"task": "x"},     "description": "save"}
        ]'''
        steps = planner._parse_steps(json_response)
        assert len(steps) == 2
        assert steps[0].agent == "executor"
        assert steps[1].agent == "memory"

    @pytest.mark.asyncio
    async def test_plan_ignores_invalid_agents(self):
        """_parse_steps doit ignorer les agents inconnus."""
        planner = MissionPlanner()
        json_response = '[{"agent": "unknown_bot", "endpoint": "/foo", "payload": {}}]'
        steps = planner._parse_steps(json_response)
        assert len(steps) == 0

    @pytest.mark.asyncio
    async def test_plan_returns_empty_on_invalid_json(self):
        """_parse_steps doit retourner [] si le JSON est invalide."""
        planner = MissionPlanner()
        steps = planner._parse_steps("Ce n'est pas du JSON valide !")
        assert steps == []

    @pytest.mark.asyncio
    async def test_plan_uses_brain_response_when_available(self):
        """plan doit utiliser la réponse du Brain si disponible."""
        planner = MissionPlanner()
        llm_json = '[{"agent": "executor", "endpoint": "/run_command", "payload": {"command": "echo ok"}, "description": "run"}]'
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"response": llm_json}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            steps = await planner.plan("run a command")

        assert len(steps) == 1
        assert steps[0].agent == "executor"
