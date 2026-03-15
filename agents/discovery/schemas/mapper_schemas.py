"""
mapper_schemas.py — Pydantic schemas for the Mapper / Discovery Agent.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FileInfo(BaseModel):
    """Metadata for a discovered file."""

    path: str
    name: str
    extension: str
    size_bytes: int
    modified_at: float  # Unix timestamp
    category: str = ""  # "code", "doc", "data", "media", "config", …


class AppInfo(BaseModel):
    """An application discovered on the system."""

    name: str
    path: str
    bundle_id: str = ""
    version: str = ""
    category: str = ""  # "dev_tool", "productivity", "system", …


class ToolInfo(BaseModel):
    """A CLI tool discovered in $PATH."""

    name: str
    path: str
    version: str = ""
    category: str = ""  # "vcs", "runtime", "build", "cloud", …


class WorldModel(BaseModel):
    """Compiled snapshot of the system's environment."""

    files: list[FileInfo] = Field(default_factory=list)
    apps: list[AppInfo] = Field(default_factory=list)
    tools: list[ToolInfo] = Field(default_factory=list)
    scanned_at: float = 0.0
    total_files: int = 0
    total_apps: int = 0
    total_tools: int = 0
    scan_duration_ms: int = 0


class ScanFilesRequest(BaseModel):
    """Optional parameters for /scan endpoint."""

    directories: list[str] = Field(
        default_factory=list,
        description="Directories to scan. Defaults to ~/Documents, ~/Projects, ~/Desktop.",
    )
    extensions: list[str] = Field(
        default_factory=list,
        description="Filter by extensions (e.g. ['.py', '.js']). Empty = all.",
    )
    max_files: int = Field(
        default=5000,
        ge=1,
        le=50000,
        description="Hard cap on number of files to index.",
    )


class MapperStatus(BaseModel):
    """Health + stats for the Mapper agent."""

    status: str
    last_scan_at: float
    total_files: int
    total_apps: int
    total_tools: int
    memory_agent_reachable: bool
    timestamp: str
