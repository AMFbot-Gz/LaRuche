"""
mapper_service.py — Core scanning logic for the Mapper / Discovery Agent.

Responsibilities:
  - scan_files()  : walk configured directories, extract file metadata
  - scan_apps()   : list macOS .app bundles in /Applications
  - scan_tools()  : discover CLI tools in $PATH
  - build_world_model() : combine all three into a WorldModel snapshot
  - send_to_memory()    : push the world model to Memory Agent via HTTP
"""

from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests

from agents.discovery.schemas.mapper_schemas import (
    AppInfo,
    FileInfo,
    ToolInfo,
    WorldModel,
)

# ─── Configuration ────────────────────────────────────────────────────────────

_MEMORY_URL = os.getenv("AGENT_MEMORY_URL", "http://localhost:8006")
_MEMORY_TIMEOUT = 5  # seconds

# Default scan roots (expanduser applied at runtime)
_DEFAULT_SCAN_DIRS = [
    "~/Documents",
    "~/Projects",
    "~/Desktop",
]

# File category rules (extension → category)
_EXT_CATEGORIES: dict[str, str] = {
    ".py": "code", ".js": "code", ".ts": "code", ".go": "code",
    ".rs": "code", ".c": "code", ".cpp": "code", ".java": "code",
    ".rb": "code", ".sh": "code", ".bash": "code", ".zsh": "code",
    ".md": "doc", ".txt": "doc", ".rst": "doc", ".pdf": "doc",
    ".docx": "doc", ".csv": "data", ".json": "data", ".yaml": "data",
    ".yml": "data", ".toml": "data", ".xml": "data", ".sql": "data",
    ".png": "media", ".jpg": "media", ".jpeg": "media", ".gif": "media",
    ".mp4": "media", ".mp3": "media", ".wav": "media",
    ".env": "config", ".ini": "config", ".cfg": "config",
    ".zip": "archive", ".tar": "archive", ".gz": "archive", ".rar": "archive",
}

# Known CLI tools and their categories
_TOOL_CATEGORIES: dict[str, str] = {
    "git": "vcs", "gh": "vcs", "svn": "vcs",
    "python": "runtime", "python3": "runtime", "node": "runtime",
    "ruby": "runtime", "go": "runtime", "cargo": "runtime",
    "npm": "build", "pnpm": "build", "yarn": "build",
    "pip": "build", "pip3": "build", "uv": "build",
    "make": "build", "cmake": "build", "gradle": "build",
    "docker": "infra", "kubectl": "infra", "terraform": "infra",
    "aws": "cloud", "gcloud": "cloud", "az": "cloud",
    "curl": "util", "wget": "util", "jq": "util",
    "ffmpeg": "media", "convert": "media",
}


# ─── MapperService ─────────────────────────────────────────────────────────────


class MapperService:
    """Scans the local environment and builds a WorldModel snapshot."""

    def __init__(self) -> None:
        self._last_model: WorldModel = WorldModel()

    # ── Public API ────────────────────────────────────────────────────────────

    def scan_files(
        self,
        directories: list[str] | None = None,
        extensions: list[str] | None = None,
        max_files: int = 5000,
    ) -> list[FileInfo]:
        """
        Walk the specified directories and collect file metadata.

        Args:
            directories: Paths to scan. Defaults to _DEFAULT_SCAN_DIRS.
            extensions:  Extension whitelist. None/empty = all extensions.
            max_files:   Hard cap to avoid runaway scans.

        Returns:
            List of FileInfo objects (sorted by modified_at descending).
        """
        roots = [
            Path(d).expanduser()
            for d in (directories or _DEFAULT_SCAN_DIRS)
        ]
        ext_filter = {e.lower() for e in (extensions or [])}
        files: list[FileInfo] = []

        for root in roots:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if len(files) >= max_files:
                    break
                # Skip hidden dirs (node_modules, .git, __pycache__, …)
                if any(part.startswith(".") for part in path.parts):
                    continue
                if any(part in {"node_modules", "__pycache__", ".venv", "venv"}
                       for part in path.parts):
                    continue
                if not path.is_file():
                    continue

                ext = path.suffix.lower()
                if ext_filter and ext not in ext_filter:
                    continue

                try:
                    stat = path.stat()
                    files.append(FileInfo(
                        path=str(path),
                        name=path.name,
                        extension=ext,
                        size_bytes=stat.st_size,
                        modified_at=stat.st_mtime,
                        category=_EXT_CATEGORIES.get(ext, "other"),
                    ))
                except OSError:
                    continue

        files.sort(key=lambda f: f.modified_at, reverse=True)
        return files

    def scan_apps(self) -> list[AppInfo]:
        """
        List .app bundles installed in /Applications on macOS.

        Returns:
            List of AppInfo objects.
        """
        apps: list[AppInfo] = []
        app_dirs = [Path("/Applications"), Path("/Applications/Utilities")]

        for app_dir in app_dirs:
            if not app_dir.exists():
                continue
            for entry in app_dir.iterdir():
                if entry.suffix.lower() != ".app":
                    continue
                bundle_id = self._get_bundle_id(entry)
                version   = self._get_app_version(entry)
                apps.append(AppInfo(
                    name=entry.stem,
                    path=str(entry),
                    bundle_id=bundle_id,
                    version=version,
                    category=self._classify_app(entry.stem),
                ))

        apps.sort(key=lambda a: a.name.lower())
        return apps

    def scan_tools(self) -> list[ToolInfo]:
        """
        Discover CLI tools available in $PATH.

        Returns:
            List of ToolInfo for every tool found in $PATH.
        """
        tools: list[ToolInfo] = []
        path_dirs = os.environ.get("PATH", "").split(":")

        seen: set[str] = set()
        for path_dir in path_dirs:
            p = Path(path_dir)
            if not p.is_dir():
                continue
            for entry in p.iterdir():
                if entry.name in seen:
                    continue
                try:
                    if not entry.is_file():
                        continue
                    if not os.access(entry, os.X_OK):
                        continue
                except OSError:
                    continue
                seen.add(entry.name)
                tools.append(ToolInfo(
                    name=entry.name,
                    path=str(entry),
                    version=self._get_tool_version(entry.name),
                    category=_TOOL_CATEGORIES.get(entry.name, "other"),
                ))

        tools.sort(key=lambda t: t.name.lower())
        return tools

    def build_world_model(
        self,
        directories: list[str] | None = None,
        max_files: int = 5000,
    ) -> WorldModel:
        """
        Full scan: files + apps + tools, combined into a WorldModel.

        Also sends a compact summary to the Memory Agent.
        """
        t0 = time.time()

        files = self.scan_files(directories=directories, max_files=max_files)
        apps  = self.scan_apps()
        tools = self.scan_tools()

        model = WorldModel(
            files=files,
            apps=apps,
            tools=tools,
            scanned_at=t0,
            total_files=len(files),
            total_apps=len(apps),
            total_tools=len(tools),
            scan_duration_ms=int((time.time() - t0) * 1000),
        )
        self._last_model = model
        self._send_to_memory(model)
        return model

    def get_last_model(self) -> WorldModel:
        """Return the most recent WorldModel without rescanning."""
        return self._last_model

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _get_bundle_id(self, app_path: Path) -> str:
        """Read CFBundleIdentifier from macOS .app/Contents/Info.plist."""
        try:
            result = subprocess.run(
                ["defaults", "read", str(app_path / "Contents" / "Info"), "CFBundleIdentifier"],
                capture_output=True, text=True, timeout=2,
            )
            return result.stdout.strip() if result.returncode == 0 else ""
        except Exception:
            return ""

    def _get_app_version(self, app_path: Path) -> str:
        """Read CFBundleShortVersionString from Info.plist."""
        try:
            result = subprocess.run(
                ["defaults", "read", str(app_path / "Contents" / "Info"),
                 "CFBundleShortVersionString"],
                capture_output=True, text=True, timeout=2,
            )
            return result.stdout.strip() if result.returncode == 0 else ""
        except Exception:
            return ""

    def _classify_app(self, name: str) -> str:
        """Heuristic category assignment based on app name."""
        name_lower = name.lower()
        if any(k in name_lower for k in ["code", "studio", "xcode", "jetbrains",
                                          "intellij", "pycharm", "cursor", "vim",
                                          "emacs", "sublime"]):
            return "dev_tool"
        if any(k in name_lower for k in ["terminal", "iterm", "warp", "hyper"]):
            return "terminal"
        if any(k in name_lower for k in ["docker", "orbstack", "podman"]):
            return "infra"
        if any(k in name_lower for k in ["chrome", "firefox", "safari", "arc",
                                          "opera", "brave"]):
            return "browser"
        if any(k in name_lower for k in ["slack", "discord", "zoom", "teams",
                                          "telegram", "whatsapp"]):
            return "communication"
        return "productivity"

    def _get_tool_version(self, name: str) -> str:
        """Try to get version with --version or -V flag."""
        for flag in ["--version", "-V", "version"]:
            try:
                result = subprocess.run(
                    [name, flag], capture_output=True, text=True, timeout=2,
                )
                first_line = (result.stdout or result.stderr).strip().splitlines()
                if first_line:
                    return first_line[0][:80]
            except Exception:
                continue
        return ""

    def _send_to_memory(self, model: WorldModel) -> None:
        """
        Fire-and-forget: send a compact summary to Memory Agent.

        Stores a text summary (not the full model) so the LLM can query it later.
        """
        try:
            summary = (
                f"World model snapshot: {model.total_files} files, "
                f"{model.total_apps} apps, {model.total_tools} tools. "
                f"Scanned in {model.scan_duration_ms}ms."
            )
            requests.post(
                f"{_MEMORY_URL}/memories",
                json={
                    "task": "world_model_scan",
                    "result": {
                        "total_files": model.total_files,
                        "total_apps":  model.total_apps,
                        "total_tools": model.total_tools,
                        "scan_duration_ms": model.scan_duration_ms,
                    },
                    "plan": {},
                    "success": True,
                    "context": summary,
                },
                timeout=_MEMORY_TIMEOUT,
            )
        except Exception:
            pass  # Non-blocking — memory agent may not be running
