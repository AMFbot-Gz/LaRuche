"""
services/llm_code_generator.py — Générateur de code via Ollama

Prend une CodingTask, construit un prompt précis, appelle Ollama,
nettoie la réponse et retourne le code Python brut.
"""

from __future__ import annotations

import json
import re
import time
from typing import TYPE_CHECKING

import requests

if TYPE_CHECKING:
    from agents.evolution.schemas.coding_task import CodingTask, TaskComplexity

# Modèles par complexité (local-first)
MODEL_BY_COMPLEXITY: dict[str, list[str]] = {
    "simple":  ["llama3.2:3b", "llama3", "llama3.2"],
    "medium":  ["qwen3-coder", "llama3.2", "llama3"],
    "complex": ["qwen3-coder", "llama3.2", "llama3"],
}

SYSTEM_PROMPT = """\
Tu es un expert Python spécialisé en automatisation macOS et scripting.
Ta seule mission : générer une fonction Python exécutable selon les spécifications données.

RÈGLES STRICTES :
1. Réponds UNIQUEMENT avec le code Python — aucun texte autour.
2. Commence directement par les imports.
3. Définis une fonction principale execute(params: dict) -> dict.
4. La fonction doit retourner {"success": bool, "result": str, "error": str | None}.
5. N'utilise PAS : os.system, eval, exec, __import__, shutil.rmtree, socket.
6. Gère toujours les exceptions avec try/except.
7. Si tu ne peux pas réaliser la tâche de manière sécurisée, retourne {"success": False, "result": "", "error": "tâche non réalisable en sandbox"}.
"""


class LLMCodeGenerator:
    """
    Génère du code Python depuis une CodingTask via Ollama.

    Usage :
        generator = LLMCodeGenerator()
        code_obj  = generator.generate(task)
        print(code_obj.extracted_code)
    """

    def __init__(
        self,
        ollama_url: str = "http://localhost:11434",
        timeout: int = 60,
    ):
        self.ollama_url = ollama_url.rstrip("/")
        self.timeout    = timeout

    # ─── API publique ──────────────────────────────────────────────────────────

    def generate(self, task: "CodingTask") -> "GeneratedCode":
        """Point d'entrée principal. Lève une exception si tous les modèles échouent."""
        from agents.evolution.schemas.coding_task import GeneratedCode

        models = MODEL_BY_COMPLEXITY.get(task.complexity.value, MODEL_BY_COMPLEXITY["medium"])
        prompt = self._build_prompt(task)

        last_error: Exception | None = None
        for model in models:
            if not self._model_available(model):
                continue
            try:
                t0  = time.monotonic()
                raw = self._call_ollama(model, prompt)
                ms  = int((time.monotonic() - t0) * 1000)

                code = self._extract_code(raw)
                return GeneratedCode(
                    raw_response=raw,
                    extracted_code=code,
                    model_used=model,
                    generation_ms=ms,
                )
            except Exception as exc:
                last_error = exc
                continue

        raise RuntimeError(
            f"Aucun modèle disponible pour générer le code. "
            f"Modèles essayés : {models}. "
            f"Dernière erreur : {last_error}"
        )

    # ─── Construction du prompt ────────────────────────────────────────────────

    def _build_prompt(self, task: "CodingTask") -> str:
        """Construit un prompt structuré et précis pour le LLM."""
        lines = [
            f"TÂCHE : {task.description}",
            "",
        ]

        if task.expected_output:
            lines += [f"SORTIE ATTENDUE : {task.expected_output}", ""]

        if task.context:
            ctx_str = json.dumps(task.context, ensure_ascii=False, indent=2)
            lines += [
                "CONTEXTE (variables disponibles dans params) :",
                ctx_str,
                "",
            ]

        lines += [
            f"COMPLEXITÉ : {task.complexity.value}",
            f"TIMEOUT D'EXÉCUTION : {task.timeout_seconds}s",
            "",
            "Génère le code Python maintenant :",
        ]
        return "\n".join(lines)

    # ─── Appel Ollama ──────────────────────────────────────────────────────────

    def _call_ollama(self, model: str, prompt: str) -> str:
        """Appelle l'API Ollama /api/generate et retourne la réponse complète."""
        payload = {
            "model":  model,
            "prompt": prompt,
            "system": SYSTEM_PROMPT,
            "stream": False,
            "options": {
                "temperature": 0.2,   # Faible temp pour du code déterministe
                "top_p":       0.9,
                "num_predict": 1024,
            },
        }
        resp = requests.post(
            f"{self.ollama_url}/api/generate",
            json=payload,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", "")

    def _model_available(self, model: str) -> bool:
        """Vérifie si le modèle est installé dans Ollama."""
        try:
            resp = requests.get(f"{self.ollama_url}/api/tags", timeout=5)
            if resp.status_code != 200:
                return False
            names = {m["name"].split(":")[0] for m in resp.json().get("models", [])}
            base  = model.split(":")[0]
            return base in names
        except Exception:
            return False

    # ─── Nettoyage du code ────────────────────────────────────────────────────

    def _extract_code(self, raw: str) -> str:
        """
        Extrait le code Python depuis la réponse brute du LLM.
        Gère les blocs ```python ... ```, ``` ... ```, et le code nu.
        """
        # 1. Bloc ```python ... ```
        m = re.search(r"```python\s*\n(.*?)```", raw, re.DOTALL | re.IGNORECASE)
        if m:
            return m.group(1).strip()

        # 2. Bloc ``` ... ```
        m = re.search(r"```\s*\n(.*?)```", raw, re.DOTALL)
        if m:
            return m.group(1).strip()

        # 3. Code nu — cherche la première ligne qui ressemble à Python
        lines = raw.splitlines()
        start = 0
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith(("import ", "from ", "def ", "class ", "#")):
                start = i
                break

        code = "\n".join(lines[start:]).strip()
        return code if code else raw.strip()
