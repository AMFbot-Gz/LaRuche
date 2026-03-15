"""
auto_coder_bee.py — FastAPI app de l'Auto-Coder Bee

Endpoint principal : POST /generate_and_run
  1. Valide la CodingTask (Pydantic)
  2. Génère le code via Ollama (LLMCodeGenerator)
  3. Exécute dans un sandbox sécurisé (SandboxExecutor)
  4. Sauvegarde le skill si succès
  5. Retourne CodingTaskResult complet

Lancement :
  uvicorn auto_coder_bee:app --port 8005 --reload
"""

from __future__ import annotations

import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from agents.evolution.schemas.coding_task import (
    CodingTask,
    CodingTaskResult,
    ExecutionStatus,
    GeneratedCode,
    SandboxResult,
)
from agents.evolution.services.llm_code_generator import LLMCodeGenerator
from agents.evolution.services.sandbox_executor import SandboxExecutor

# ─── Config ───────────────────────────────────────────────────────────────────

BASE_DIR       = Path(__file__).parent.parent.parent  # chimera/
SKILLS_GEN_DIR = BASE_DIR / "skills" / "generated"
SKILLS_GEN_DIR.mkdir(parents=True, exist_ok=True)

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Auto-Coder Bee",
    description="Génère et exécute du code Python à la volée via LLM + sandbox",
    version="1.0.0",
)

_generator = LLMCodeGenerator()
_executor  = SandboxExecutor()


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status":    "ok",
        "service":   "auto_coder_bee",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "skills_generated": len(list(SKILLS_GEN_DIR.glob("*.py"))),
    }


@app.post("/generate_and_run", response_model=CodingTaskResult)
async def generate_and_run(task: CodingTask) -> CodingTaskResult:
    """
    Pipeline complet : description → code → sandbox → résultat.

    Body :
        {
          "description": "Compte le nombre de fichiers .py dans /tmp",
          "context": {"path": "/tmp"},
          "expected_output": "Un entier représentant le nombre de fichiers",
          "complexity": "simple",
          "save_on_success": true,
          "timeout_seconds": 10
        }
    """
    task_id  = str(uuid.uuid4())
    t_total  = time.monotonic()

    # ── 1. Génération ─────────────────────────────────────────────────────────
    try:
        generated: GeneratedCode = _generator.generate(task)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # ── 2. Exécution sandbox ──────────────────────────────────────────────────
    execution: SandboxResult = _executor.run(
        code=generated.extracted_code,
        params=task.context,
        timeout=task.timeout_seconds,
    )

    # ── 3. Sauvegarde conditionnelle du skill ─────────────────────────────────
    skill_saved = False
    skill_path  = None

    if task.save_on_success and execution.status == ExecutionStatus.SUCCESS:
        skill_path  = _save_skill(task, generated)
        skill_saved = skill_path is not None

    # ── 4. Résultat final ─────────────────────────────────────────────────────
    total_ms = int((time.monotonic() - t_total) * 1000)

    return CodingTaskResult(
        task_id=task_id,
        status=execution.status,
        generated=generated,
        execution=execution,
        skill_saved=skill_saved,
        skill_path=str(skill_path) if skill_path else None,
        total_ms=total_ms,
    )


@app.get("/skills")
async def list_skills():
    """Liste tous les skills auto-générés sauvegardés."""
    skills = []
    for f in sorted(SKILLS_GEN_DIR.glob("*.py")):
        meta_file = f.with_suffix(".json")
        meta = {}
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text())
            except Exception:
                pass
        skills.append({
            "name":       f.stem,
            "file":       str(f),
            "size_bytes": f.stat().st_size,
            "created_at": meta.get("created_at"),
            "description": meta.get("description"),
            "model_used": meta.get("model_used"),
        })
    return {"skills": skills, "count": len(skills)}


@app.delete("/skills/{skill_name}")
async def delete_skill(skill_name: str):
    """Supprime un skill généré."""
    # Sanitize — uniquement lettres, chiffres, underscore
    if not re.match(r'^[a-zA-Z0-9_]+$', skill_name):
        raise HTTPException(status_code=400, detail="Nom de skill invalide")

    py_file   = SKILLS_GEN_DIR / f"{skill_name}.py"
    json_file = SKILLS_GEN_DIR / f"{skill_name}.json"

    if not py_file.exists():
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' introuvable")

    py_file.unlink()
    json_file.unlink(missing_ok=True)
    return {"deleted": skill_name}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe_skill_name(description: str) -> str:
    """Génère un nom de fichier snake_case depuis la description."""
    name = description.lower()
    name = re.sub(r"[àáâãäå]", "a", name)
    name = re.sub(r"[èéêë]", "e", name)
    name = re.sub(r"[ìíîï]", "i", name)
    name = re.sub(r"[òóôõö]", "o", name)
    name = re.sub(r"[ùúûü]", "u", name)
    name = re.sub(r"[^a-z0-9\s]", "", name)
    name = re.sub(r"\s+", "_", name.strip())
    name = name[:40]  # max 40 chars
    return name or f"skill_{uuid.uuid4().hex[:6]}"


def _save_skill(task: CodingTask, generated: GeneratedCode) -> Path | None:
    """Sauvegarde le code généré + métadonnées dans skills/generated/."""
    try:
        skill_name = _safe_skill_name(task.description)
        # Évite les écrasements
        py_file = SKILLS_GEN_DIR / f"{skill_name}.py"
        if py_file.exists():
            skill_name = f"{skill_name}_{uuid.uuid4().hex[:4]}"
            py_file    = SKILLS_GEN_DIR / f"{skill_name}.py"

        # Code avec en-tête documenté
        header = (
            f'"""\n'
            f'Auto-generated skill: {skill_name}\n'
            f'Description : {task.description}\n'
            f'Modèle      : {generated.model_used}\n'
            f'Créé le     : {datetime.now(timezone.utc).isoformat()}\n'
            f'"""\n\n'
        )
        py_file.write_text(header + generated.extracted_code, encoding="utf-8")

        # Métadonnées JSON
        meta = {
            "name":         skill_name,
            "description":  task.description,
            "expected_output": task.expected_output,
            "model_used":   generated.model_used,
            "generation_ms": generated.generation_ms,
            "created_at":   datetime.now(timezone.utc).isoformat(),
            "complexity":   task.complexity.value,
        }
        (SKILLS_GEN_DIR / f"{skill_name}.json").write_text(
            json.dumps(meta, indent=2, ensure_ascii=False)
        )
        return py_file

    except Exception:
        return None


# ─── Lancement direct ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("auto_coder_bee:app", host="0.0.0.0", port=8005, reload=True)
