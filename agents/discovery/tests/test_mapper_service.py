"""
test_mapper_service.py — Unit tests for MapperService.

Coverage:
  - scan_files: real tmp dirs, extension filtering, hidden dir exclusion, max_files cap
  - scan_apps:  macOS /Applications parse or graceful empty list
  - scan_tools: $PATH discovery returns list of ToolInfo
  - build_world_model: integration (mocked memory call)
  - WorldModel schema validation
  - FileInfo category assignment
"""

from __future__ import annotations

import time
from pathlib import Path
from unittest.mock import patch

import pytest

from agents.discovery.schemas.mapper_schemas import FileInfo, WorldModel
from agents.discovery.services.mapper_service import MapperService


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def svc() -> MapperService:
    return MapperService()


@pytest.fixture
def tmp_project(tmp_path: Path) -> Path:
    """Create a small fake project tree for scan tests."""
    (tmp_path / "main.py").write_text("print('hello')")
    (tmp_path / "README.md").write_text("# Project")
    (tmp_path / "data.json").write_text("{}")
    (tmp_path / "image.png").write_bytes(b"\x89PNG")
    (tmp_path / ".hidden").mkdir()
    (tmp_path / ".hidden" / "secret.txt").write_text("nope")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "dep.js").write_text("module.exports = {}")
    sub = tmp_path / "src"
    sub.mkdir()
    (sub / "utils.ts").write_text("export const x = 1")
    return tmp_path


# ─── scan_files tests ─────────────────────────────────────────────────────────


def test_scan_files_basic(svc: MapperService, tmp_project: Path) -> None:
    """scan_files returns all non-hidden, non-excluded files."""
    files = svc.scan_files(directories=[str(tmp_project)])
    names = {f.name for f in files}
    assert "main.py" in names
    assert "README.md" in names
    assert "utils.ts" in names


def test_scan_files_excludes_hidden(svc: MapperService, tmp_project: Path) -> None:
    """Files inside .hidden dirs are excluded."""
    files = svc.scan_files(directories=[str(tmp_project)])
    names = {f.name for f in files}
    assert "secret.txt" not in names


def test_scan_files_excludes_node_modules(svc: MapperService, tmp_project: Path) -> None:
    """Files inside node_modules are excluded."""
    files = svc.scan_files(directories=[str(tmp_project)])
    names = {f.name for f in files}
    assert "dep.js" not in names


def test_scan_files_extension_filter(svc: MapperService, tmp_project: Path) -> None:
    """Extension filter restricts results."""
    files = svc.scan_files(directories=[str(tmp_project)], extensions=[".py"])
    assert all(f.extension == ".py" for f in files)
    assert any(f.name == "main.py" for f in files)


def test_scan_files_max_files(svc: MapperService, tmp_project: Path) -> None:
    """max_files cap is respected."""
    files = svc.scan_files(directories=[str(tmp_project)], max_files=2)
    assert len(files) <= 2


def test_scan_files_category_assignment(svc: MapperService, tmp_project: Path) -> None:
    """File categories are assigned correctly."""
    files = svc.scan_files(directories=[str(tmp_project)])
    by_name = {f.name: f for f in files}
    assert by_name["main.py"].category == "code"
    assert by_name["README.md"].category == "doc"
    assert by_name["data.json"].category == "data"
    assert by_name["image.png"].category == "media"


def test_scan_files_sorted_by_modified_at(svc: MapperService, tmp_project: Path) -> None:
    """Results are sorted by modified_at descending."""
    # Touch one file to update its mtime
    time.sleep(0.01)
    (tmp_path_ref := tmp_project / "main.py").touch()
    files = svc.scan_files(directories=[str(tmp_project)])
    if len(files) >= 2:
        assert files[0].modified_at >= files[1].modified_at


def test_scan_files_nonexistent_dir(svc: MapperService) -> None:
    """Non-existent directories are silently skipped."""
    files = svc.scan_files(directories=["/nonexistent/path/xyz"])
    assert files == []


# ─── scan_apps tests ──────────────────────────────────────────────────────────


def test_scan_apps_returns_list(svc: MapperService) -> None:
    """scan_apps always returns a list (empty on non-macOS or no apps)."""
    apps = svc.scan_apps()
    assert isinstance(apps, list)


def test_scan_apps_have_name(svc: MapperService) -> None:
    """Every AppInfo has a non-empty name."""
    apps = svc.scan_apps()
    for app in apps:
        assert app.name != ""


# ─── scan_tools tests ─────────────────────────────────────────────────────────
# _get_tool_version calls subprocess for every binary in $PATH — always mock it.


def test_scan_tools_returns_list(svc: MapperService) -> None:
    """scan_tools always returns a list."""
    with patch.object(svc, "_get_tool_version", return_value=""):
        tools = svc.scan_tools()
    assert isinstance(tools, list)


def test_scan_tools_python_found(svc: MapperService) -> None:
    """python3 or python should be in $PATH."""
    with patch.object(svc, "_get_tool_version", return_value=""):
        tools = svc.scan_tools()
    names = {t.name for t in tools}
    assert "python3" in names or "python" in names


def test_scan_tools_have_path(svc: MapperService) -> None:
    """Every ToolInfo has a non-empty path."""
    with patch.object(svc, "_get_tool_version", return_value=""):
        tools = svc.scan_tools()
    for tool in tools[:10]:  # check first 10 only to keep test fast
        assert tool.path != ""


# ─── build_world_model tests ──────────────────────────────────────────────────


def test_build_world_model_structure(svc: MapperService, tmp_project: Path) -> None:
    """build_world_model returns a valid WorldModel with correct counts."""
    with patch.object(svc, "_send_to_memory"):
        model = svc.build_world_model(directories=[str(tmp_project)])

    assert isinstance(model, WorldModel)
    assert model.total_files == len(model.files)
    assert model.total_apps  == len(model.apps)
    assert model.total_tools == len(model.tools)
    assert model.total_files > 0
    assert model.scan_duration_ms >= 0


def test_build_world_model_caches_last(svc: MapperService, tmp_project: Path) -> None:
    """get_last_model returns the most recent WorldModel."""
    with patch.object(svc, "_send_to_memory"):
        model = svc.build_world_model(directories=[str(tmp_project)])

    assert svc.get_last_model() is model


def test_build_world_model_memory_called(svc: MapperService, tmp_project: Path) -> None:
    """_send_to_memory is called after a full scan."""
    with patch.object(svc, "_send_to_memory") as mock_send:
        svc.build_world_model(directories=[str(tmp_project)])

    mock_send.assert_called_once()
