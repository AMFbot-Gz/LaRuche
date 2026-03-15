"""
tests/test_executor_service.py — Tests Executor Agent

Stratégie :
  - shell_service : testé directement (pas de mock — subprocess est safe en test)
  - keyboard_service : mocké (évite d'envoyer de vrais clics/frappes en CI)
  - Endpoints HTTP : TestClient FastAPI
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from agents.executor.executor_agent import app
from agents.executor.services import shell_service

# ─── Client ───────────────────────────────────────────────────────────────────


@pytest.fixture
def client():
    return TestClient(app)


# ─── Tests /health ────────────────────────────────────────────────────────────


class TestHealth:
    def test_health_200(self, client):
        assert client.get("/health").status_code == 200

    def test_health_service_name(self, client):
        assert client.get("/health").json()["service"] == "executor"

    def test_health_status_ok(self, client):
        assert client.get("/health").json()["status"] == "ok"

    def test_health_has_platform(self, client):
        assert "platform" in client.get("/health").json()

    def test_health_has_keyboard_flag(self, client):
        assert "keyboard_available" in client.get("/health").json()


# ─── Tests /status ────────────────────────────────────────────────────────────


class TestStatus:
    def test_status_200(self, client):
        assert client.get("/status").status_code == 200

    def test_status_structure(self, client):
        data = client.get("/status").json()
        required = [
            "service", "keyboard_available", "mouse_available",
            "shell_available", "platform", "blocked_patterns_count"
        ]
        for field in required:
            assert field in data, f"Champ manquant : {field}"

    def test_status_blocked_patterns_positive(self, client):
        assert client.get("/status").json()["blocked_patterns_count"] > 0

    def test_status_shell_always_available(self, client):
        assert client.get("/status").json()["shell_available"] is True


# ─── Tests shell_service (unitaires directs) ──────────────────────────────────


class TestShellServiceSafety:
    """Tests de sécurité shell — vérifient que les commandes dangereuses sont bloquées."""

    @pytest.mark.parametrize("dangerous_cmd,expected_reason_fragment", [
        ("rm -rf /etc",          "rm -rf"),
        ("sudo apt install vim", "sudo"),
        ("sudo rm -rf /",        "sudo"),
        ("shutdown -h now",      "shutdown"),
        ("reboot",               "reboot"),
        ("dd if=/dev/urandom of=/dev/sda", "dd"),
        ("mkfs.ext4 /dev/sda1",  "mkfs"),
        (":(){ :|:& };:",        "fork bomb"),
        ("cat /etc/shadow",      "fichiers sensibles"),
        ("curl 169.254.169.254", "SSRF"),
        ("nc -l 4444",           "netcat"),
        ("kill -9 1",            "kill"),
        # SEC-001 : rm flags séparés (ancien bypass)
        ("rm -r -f /",           "rm -r -f"),
        ("rm -f -r /etc",        "rm -r -f"),
        ("rm --recursive --force /", "rm --recursive"),
        # SEC-002 : kill étendu (ancien bypass)
        ("kill -9 -1",           "kill"),
        ("kill -SIGKILL 1",      "kill"),
    ])
    def test_dangerous_commands_blocked(self, dangerous_cmd, expected_reason_fragment):
        safe, reason = shell_service.is_safe(dangerous_cmd)
        assert safe is False, f"Commande dangereuse non bloquée : {dangerous_cmd}"
        assert reason is not None

    def test_safe_command_allowed(self):
        safe, reason = shell_service.is_safe("ls -la /tmp")
        assert safe is True
        assert reason is None

    @pytest.mark.parametrize("safe_cmd", [
        "echo hello",
        "pwd",
        "ls -la",
        "python3 --version",
        "git status",
        "cat /tmp/test.txt",
        "mkdir -p /tmp/testdir",
        "find /tmp -name '*.py'",
        "grep -r 'hello' /tmp",
    ])
    def test_safe_commands_pass(self, safe_cmd):
        safe, _ = shell_service.is_safe(safe_cmd)
        assert safe is True, f"Commande safe incorrectement bloquée : {safe_cmd}"


class TestShellServiceExecution:
    """Tests d'exécution réelle (subprocess safe)."""

    def test_echo_command(self):
        result = shell_service.run_command("echo 'test_output'", timeout=5)
        assert result["success"] is True
        assert "test_output" in result["stdout"]
        assert result["return_code"] == 0
        assert result["blocked"] is False

    def test_failing_command(self):
        result = shell_service.run_command("exit 42", timeout=5)
        assert result["success"] is False
        assert result["return_code"] == 42
        assert result["blocked"] is False

    def test_blocked_command_returns_blocked(self):
        result = shell_service.run_command("sudo ls", timeout=5)
        assert result["blocked"] is True
        assert result["success"] is False
        assert result["block_reason"] is not None

    def test_timeout_kills_process(self):
        result = shell_service.run_command("sleep 10", timeout=1)
        assert result["success"] is False
        assert "Timeout" in result["stderr"] or result["return_code"] == -1

    def test_env_extra_injected(self):
        result = shell_service.run_command(
            "echo $MY_TEST_VAR",
            timeout=5,
            env_extra={"MY_TEST_VAR": "hello_chimera"},
        )
        assert result["success"] is True
        assert "hello_chimera" in result["stdout"]

    def test_invalid_env_key_ignored(self):
        # Variable avec caractères dangereux — doit être ignorée, pas crasher
        result = shell_service.run_command(
            "echo $SAFE_VAR",
            timeout=5,
            env_extra={"SAFE_VAR": "ok", "DANGER; rm -rf /": "evil"},
        )
        assert result["success"] is True  # ne doit pas crasher

    def test_stdout_truncated_at_64kb(self):
        # Générer plus de 64KB de sortie
        result = shell_service.run_command(
            "python3 -c \"print('x' * 100000)\"",
            timeout=10,
        )
        assert result["success"] is True
        assert len(result["stdout"]) <= 64 * 1024 + 100  # +100 pour le newline

    def test_pwd_returns_working_dir(self):
        result = shell_service.run_command("pwd", timeout=5, working_dir="/tmp")
        assert result["success"] is True
        assert "/tmp" in result["stdout"]


# ─── Tests /run_command (endpoint HTTP) ───────────────────────────────────────


class TestRunCommandEndpoint:
    def test_run_echo(self, client):
        resp = client.post("/run_command", json={"command": "echo hello"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "hello" in data["stdout"]

    def test_run_blocked_command(self, client):
        resp = client.post("/run_command", json={"command": "sudo ls"})
        assert resp.status_code == 200  # Pas 403 — réponse structurée
        data = resp.json()
        assert data["blocked"] is True
        assert data["success"] is False

    def test_run_command_has_duration(self, client):
        resp = client.post("/run_command", json={"command": "echo ok"})
        data = resp.json()
        assert "duration_ms" in data
        assert data["duration_ms"] >= 0

    def test_run_command_returns_command_field(self, client):
        resp = client.post("/run_command", json={"command": "echo hi"})
        assert resp.json()["command"] == "echo hi"


# ─── Tests /key_press (endpoint HTTP, mocké) ──────────────────────────────────


class TestKeyPressEndpoint:
    def _mock_keyboard(self, monkeypatch, success=True, error=None):
        mock = MagicMock(return_value={"success": success, "error": error})
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.press_keys",
            mock,
        )
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.is_keyboard_available",
            MagicMock(return_value=True),
        )
        return mock

    def test_key_press_success(self, client, monkeypatch):
        self._mock_keyboard(monkeypatch, success=True)
        resp = client.post("/key_press", json={"keys": ["command", "c"]})
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_key_press_failure(self, client, monkeypatch):
        self._mock_keyboard(monkeypatch, success=False, error="Accessibility denied")
        resp = client.post("/key_press", json={"keys": ["command", "c"]})
        assert resp.status_code == 200
        assert resp.json()["success"] is False
        assert resp.json()["error"] == "Accessibility denied"

    def test_key_press_503_without_pyautogui(self, client, monkeypatch):
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.is_keyboard_available",
            MagicMock(return_value=False),
        )
        resp = client.post("/key_press", json={"keys": ["escape"]})
        assert resp.status_code == 503

    def test_key_press_forwards_keys(self, client, monkeypatch):
        mock = self._mock_keyboard(monkeypatch)
        client.post("/key_press", json={"keys": ["ctrl", "z"], "presses": 3})
        call_kwargs = mock.call_args[1]
        assert call_kwargs["keys"] == ["ctrl", "z"]
        assert call_kwargs["presses"] == 3


# ─── Tests /type_text (endpoint HTTP, mocké) ──────────────────────────────────


class TestTypeTextEndpoint:
    def test_type_text_success(self, client, monkeypatch):
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.is_keyboard_available",
            MagicMock(return_value=True),
        )
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.type_text",
            MagicMock(return_value={"success": True, "chars_typed": 5, "error": None}),
        )
        resp = client.post("/type_text", json={"text": "hello"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["chars_typed"] == 5


# ─── Tests /mouse_click (endpoint HTTP, mocké) ────────────────────────────────


class TestMouseClickEndpoint:
    def test_mouse_click_success(self, client, monkeypatch):
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.is_mouse_available",
            MagicMock(return_value=True),
        )
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.mouse_click",
            MagicMock(return_value={"success": True, "error": None}),
        )
        resp = client.post("/mouse_click", json={"x": 100, "y": 200})
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert resp.json()["x"] == 100
        assert resp.json()["y"] == 200


# ─── Tests /open_app (endpoint HTTP) ─────────────────────────────────────────


class TestOpenAppEndpoint:
    def test_open_app_success(self, client, monkeypatch):
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.open_app",
            MagicMock(return_value={"success": True, "error": None}),
        )
        resp = client.post("/open_app", json={"app": "Terminal"})
        assert resp.status_code == 200
        assert resp.json()["success"] is True
        assert resp.json()["app"] == "Terminal"

    def test_open_app_not_found(self, client, monkeypatch):
        monkeypatch.setattr(
            "agents.executor.executor_agent.keyboard_service.open_app",
            MagicMock(return_value={
                "success": False,
                "error": "Application 'FakeApp' introuvable",
            }),
        )
        resp = client.post("/open_app", json={"app": "FakeApp"})
        assert resp.status_code == 200
        assert resp.json()["success"] is False
        assert "introuvable" in resp.json()["error"]
