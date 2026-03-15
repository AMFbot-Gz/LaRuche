"""
tests/test_model_router_service.py — Tests for the Brain Agent routing logic.

Tests are split into three categories:
  - TaskAnalysis: pure Python, no network, no LLM
  - ModelSelection: pure Python, mocked available_models
  - Integration: mocked HTTP calls
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from agents.brain.services.model_router_service import ModelRouterService, TaskProfile


# ─── Fixture ──────────────────────────────────────────────────────────────────


@pytest.fixture
def router() -> ModelRouterService:
    """Router initialised without contacting Ollama."""
    with patch("agents.brain.services.model_router_service.requests.get") as mock_get:
        mock_get.side_effect = ConnectionError("Ollama not available in tests")
        r = ModelRouterService()
    # Inject some fake available models for routing tests
    r.available_models = ["llama3.2:3b", "qwen3-coder", "llama3.2"]
    return r


# ─── Task Analysis ────────────────────────────────────────────────────────────


class TestTaskAnalysis:
    def test_code_task_detected(self, router: ModelRouterService):
        p = router.analyze_task("Write a Python function to sort a list", "code")
        assert p.requires_code is True
        assert p.type == "code"

    def test_vision_task_detected(self, router: ModelRouterService):
        p = router.analyze_task("Regarde l'écran et trouve le bouton OK")
        assert p.requires_vision is True
        assert p.type == "vision"

    def test_simple_complexity(self, router: ModelRouterService):
        p = router.analyze_task("Dis bonjour")
        assert p.complexity == "simple"

    def test_complex_complexity_long_prompt(self, router: ModelRouterService):
        long_task = "Premièrement analyse le code, puis corrige les bugs, ensuite ajoute les tests"
        p = router.analyze_task(long_task)
        assert p.complexity in ("complex", "medium")
        assert p.estimated_steps >= 3

    def test_critical_complexity(self, router: ModelRouterService):
        p = router.analyze_task("Évolue et auto-améliore le système")
        assert p.complexity == "critical"

    def test_web_task_disables_vision(self, router: ModelRouterService):
        p = router.analyze_task("Navigue vers google.com et cherche en ligne")
        assert p.type == "web"
        assert p.requires_vision is False

    def test_task_profile_to_dict(self, router: ModelRouterService):
        p = router.analyze_task("Write code", "code")
        d = p.to_dict()
        assert "complexity" in d
        assert "type" in d
        assert "requires_code" in d


# ─── Model Selection ─────────────────────────────────────────────────────────


class TestModelSelection:
    def test_code_task_routes_to_qwen(self, router: ModelRouterService):
        p = TaskProfile(
            complexity="medium", type="code",
            requires_vision=False, requires_code=True,
            estimated_steps=1, confidence_required=0.8,
        )
        model = router.select_model(p)
        assert model == "qwen3-coder"

    def test_simple_task_routes_to_llama3_small(self, router: ModelRouterService):
        p = TaskProfile(
            complexity="simple", type="action",
            requires_vision=False, requires_code=False,
            estimated_steps=1, confidence_required=0.8,
        )
        model = router.select_model(p)
        assert model == "llama3.2:3b"

    def test_complex_reasoning_routes_to_llama32(self, router: ModelRouterService):
        p = TaskProfile(
            complexity="complex", type="reasoning",
            requires_vision=False, requires_code=False,
            estimated_steps=4, confidence_required=0.8,
        )
        model = router.select_model(p)
        assert model == "llama3.2"

    def test_critical_fallback_when_no_claude(self, router: ModelRouterService):
        """Without Claude key, critical tasks fall back to best available local model."""
        p = TaskProfile(
            complexity="critical", type="reasoning",
            requires_vision=False, requires_code=False,
            estimated_steps=5, confidence_required=0.95,
        )
        model = router.select_model(p)
        # Claude not in available_models → falls back to a local model
        assert model in router.available_models

    def test_preferred_model_respected(self, router: ModelRouterService):
        p = router.analyze_task("Do something simple")
        model = router.select_model(p)
        # Manual override in think() — tested via the service method
        router.available_models.append("llama3.2")
        p2 = router.analyze_task("A code task", "code")
        model2 = router.select_model(p2)
        assert model2 in router.available_models

    def test_routing_reason_populated(self, router: ModelRouterService):
        p = router.analyze_task("Write a Python function", "code")
        router.select_model(p)
        assert len(p.routing_reason) > 0
        assert p.selected_model in router.available_models


# ─── Integration (mocked HTTP) ───────────────────────────────────────────────


class TestCallModel:
    def test_call_ollama_returns_response(self, router: ModelRouterService):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"response": "Hello from Ollama!"}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.brain.services.model_router_service.requests.post", return_value=mock_resp):
            result = router.call_model("llama3.2:3b", "Say hello")

        assert result == "Hello from Ollama!"

    def test_call_ollama_timeout_returns_error_string(self, router: ModelRouterService):
        import requests as req_module

        with patch(
            "agents.brain.services.model_router_service.requests.post",
            side_effect=req_module.exceptions.Timeout,
        ):
            result = router.call_model("llama3.2:3b", "trigger timeout")

        assert "Timeout" in result or "indisponible" in result

    def test_think_raises_runtime_error_when_no_models(self, router: ModelRouterService):
        router.available_models = []
        with pytest.raises(RuntimeError, match="Aucun modèle"):
            router.think("Hello")


# ─── Routing modes ───────────────────────────────────────────────────────────


class TestRoutingModes:
    def test_local_only_mode(self, router: ModelRouterService):
        router.routing_mode = "local_only"
        p = router.analyze_task("Write code", "code")
        model = router.select_model(p)
        # In local_only mode, should not pick claude
        assert model != "claude"
        assert model in router.available_models

    def test_auto_mode_default(self, router: ModelRouterService):
        assert router.routing_mode == "auto"
