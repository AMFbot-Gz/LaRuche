"""
mapper_agent.py — FastAPI app for the Discovery / Mapper Agent (:8008)

Maps the local environment: files, macOS apps, CLI tools.
Feeds ChromaDB world_model collection via Memory Agent.

Endpoints:
  GET  /health          — liveness check
  GET  /status          — last scan stats
  POST /scan            — scan files (configurable)
  GET  /scan/apps       — list installed macOS apps
  GET  /scan/tools      — list CLI tools in $PATH
  POST /world-model     — full scan (files + apps + tools)
  GET  /world-model     — return last cached WorldModel

Launch:
  uvicorn agents.discovery.mapper_agent:app --port 8008 --reload
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI

from agents.discovery.schemas.mapper_schemas import (
    MapperStatus,
    ScanFilesRequest,
    WorldModel,
)
from agents.discovery.services.mapper_service import MapperService

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chimera Discovery / Mapper Agent",
    description="Scans files, apps, and CLI tools — feeds the world_model collection.",
    version="1.0.0",
)

# Singleton: shared across all requests
_mapper = MapperService()


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict:
    """Liveness probe — used by Queen HealthMonitor."""
    model = _mapper.get_last_model()
    return {
        "status":      "ok",
        "service":     "discovery",
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "total_files": model.total_files,
    }


@app.get("/status", response_model=MapperStatus)
async def status() -> MapperStatus:
    """Detailed stats: last scan time, counts, memory reachability."""
    import requests as req_lib

    model = _mapper.get_last_model()

    # Quick reachability check for Memory Agent
    try:
        r = req_lib.get(
            "http://localhost:8006/health",
            timeout=1.0,
        )
        memory_ok = r.status_code == 200
    except Exception:
        memory_ok = False

    return MapperStatus(
        status                = "ok",
        last_scan_at          = model.scanned_at,
        total_files           = model.total_files,
        total_apps            = model.total_apps,
        total_tools           = model.total_tools,
        memory_agent_reachable = memory_ok,
        timestamp             = datetime.now(timezone.utc).isoformat(),
    )


@app.post("/scan")
async def scan_files(req: ScanFilesRequest) -> dict:
    """
    Scan files in specified directories.

    Returns a summary + first 100 file entries.
    Full results are accessible via GET /world-model.
    """
    files = _mapper.scan_files(
        directories=req.directories or None,
        extensions=req.extensions or None,
        max_files=req.max_files,
    )
    return {
        "total_files": len(files),
        "files":       [f.model_dump() for f in files[:100]],
        "truncated":   len(files) > 100,
    }


@app.get("/scan/apps")
async def scan_apps() -> dict:
    """List all installed macOS applications."""
    apps = _mapper.scan_apps()
    return {
        "total_apps": len(apps),
        "apps":       [a.model_dump() for a in apps],
    }


@app.get("/scan/tools")
async def scan_tools() -> dict:
    """List all CLI tools available in $PATH."""
    tools = _mapper.scan_tools()
    return {
        "total_tools": len(tools),
        "tools":       [t.model_dump() for t in tools],
    }


@app.post("/world-model", response_model=WorldModel)
async def build_world_model(req: ScanFilesRequest) -> WorldModel:
    """
    Full scan: files + apps + tools.

    Stores a compact summary to Memory Agent (fire-and-forget).
    Returns the complete WorldModel.
    """
    return _mapper.build_world_model(
        directories=req.directories or None,
        max_files=req.max_files,
    )


@app.get("/world-model", response_model=WorldModel)
async def get_world_model() -> WorldModel:
    """Return the last cached WorldModel without rescanning."""
    return _mapper.get_last_model()


# ─── Direct launch ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agents.discovery.mapper_agent:app", host="0.0.0.0", port=8008, reload=True)
