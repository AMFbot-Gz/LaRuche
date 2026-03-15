"""
meta/skill_factory.py — Skill Factory Autonome

Quand PICO échoue 5× sur un objectif, génère automatiquement
un skill Python, le valide en sandbox, l'indexe et le réutilise.

Cycle : échec répété → scan vault → génération → sandbox → atlas
"""

import ast
import importlib.util
import json
import os
import re
import sys
import uuid
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path

import requests
from dotenv import load_dotenv

BASE_DIR   = Path(__file__).parent.parent
SKILLS_DIR = BASE_DIR / "skills"
ATLAS_FILE = SKILLS_DIR / "atlas.json"
VAULT_DIR  = BASE_DIR / "vault"
ACTIONS_LOG = BASE_DIR / "memory" / "actions.log"

sys.path.insert(0, str(BASE_DIR))
load_dotenv(BASE_DIR / ".env")

NVIDIA_API_URL    = "https://integrate.api.nvidia.com/v1/chat/completions"
NVIDIA_TEXT_MODEL = "meta/llama-3.1-70b-instruct"

PATTERNS_DANGEREUX = [
    "os.system", "eval(", "exec(", "__import__",
    "shutil.rmtree", "subprocess.call('rm",
    "open('/etc", "socket.connect",
]


# ─── Classe principale ────────────────────────────────────────────────────────

class SkillFactory:

    def __init__(self):
        SKILLS_DIR.mkdir(parents=True, exist_ok=True)
        self.atlas           = self._load_atlas()
        self.sandbox_timeout = 10
        self.api_key         = os.getenv("KIMI_API_KEY", "")
        self.ollama_url      = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.ollama_model    = os.getenv("OLLAMA_MODEL", "llava")

        # Marketplace adapter
        from meta.marketplace_adapter import MarketplaceAdapter
        self.marketplace = MarketplaceAdapter()
        self.marketplace.sync_to_atlas()
        # Recharge l'atlas après sync
        self.atlas = self._load_atlas()

        # Installe les 3 skills natifs PICO s'ils ne sont pas encore dans l'atlas
        self._ensure_native_skills()

        n = len(self.atlas.get("skills", []))
        print(f"🏭 SkillFactory prête — {n} skills disponibles")

    # ─── Atlas ────────────────────────────────────────────────────────────────

    def _load_atlas(self) -> dict:
        if ATLAS_FILE.exists():
            try:
                data = json.loads(ATLAS_FILE.read_text(encoding="utf-8"))
                # Migration v1 → v2
                if data.get("version", "1.0.0").startswith("1"):
                    data["version"] = "2.0.0"
                    data.setdefault("updated_at", datetime.now().isoformat())
                    for s in data.get("skills", []):
                        s.setdefault("id",             f"skill_{uuid.uuid4().hex[:8]}")
                        s.setdefault("trigger_keywords", [])
                        s.setdefault("success_rate",   1.0)
                        s.setdefault("usage_count",    0)
                        s.setdefault("auto_generated", False)
                        s.setdefault("validated",      True)
                        s.setdefault("file",           f"skills/{s.get('name','?')}.py")
                    self._save_atlas(data)
                return data
            except Exception:
                pass
        default = {"version": "2.0.0", "updated_at": datetime.now().isoformat(), "skills": []}
        self._save_atlas(default)
        return default

    def _save_atlas(self, data: dict = None) -> None:
        if data is None:
            data = self.atlas
        data["updated_at"] = datetime.now().isoformat()
        tmp = ATLAS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.rename(ATLAS_FILE)

    def _ensure_native_skills(self) -> None:
        """Installe les 3 skills natifs PICO dans l'atlas s'ils sont absents."""
        native = [
            ("pico_screenshot", "skills/pico_screenshot.py",
             "Prend une capture d'écran et la sauvegarde",
             ["screenshot", "capture", "écran", "voir", "regarde", "photo écran", "prends"]),
            ("pico_applescript", "skills/pico_applescript.py",
             "Exécute des commandes AppleScript macOS natives",
             ["applescript", "osascript", "finder", "dock", "notification", "dialogue", "alerte", "macOS natif"]),
            ("pico_web_open", "skills/pico_web_open.py",
             "Ouvre une URL dans le navigateur par défaut macOS",
             ["ouvre", "url", "site", "navigateur", "http", "www", "browser", "lien", "visite", "accède"]),
        ]
        existing = {s["name"] for s in self.atlas.get("skills", [])}
        changed  = False
        for name, filepath, desc, kws in native:
            if name not in existing and (BASE_DIR / filepath).exists():
                self.atlas.setdefault("skills", []).append({
                    "id":               f"native_{name}",
                    "name":             name,
                    "file":             filepath,
                    "description":      desc,
                    "trigger_keywords": kws,
                    "success_rate":     1.0,
                    "usage_count":      0,
                    "created_at":       datetime.now().isoformat(),
                    "last_used":        None,
                    "auto_generated":   False,
                    "validated":        True,
                    "source":           "native",
                })
                changed = True
        if changed:
            self._save_atlas()

    # ─── Compat ancienne API ─────────────────────────────────────────────────

    def has_skill(self, skill_name: str) -> bool:
        return any(s["name"] == skill_name for s in self.atlas.get("skills", []))

    def get_skill_path(self, skill_name: str) -> str | None:
        for s in self.atlas.get("skills", []):
            if s["name"] == skill_name:
                return s.get("file") or s.get("path")
        return None

    def create_skill(self, task_description: str, skill_name: str) -> bool:
        """Compat ancienne API — délègue vers generate+install."""
        code = self.generate_skill(task_description, [])
        validation = self.validate_skill(code, skill_name)
        if not validation["valid"]:
            return False
        result = self.install_skill(code, validation)
        return result["installed"]

    # ─── 1. scan_needed_skills ────────────────────────────────────────────────

    def scan_needed_skills(self) -> list[str]:
        """
        Scanne vault/*.json pour les tags 'needs_new_skill'.
        Déduplique par similarité de tâche (ratio > 0.7).
        """
        needed: list[str] = []
        for f in VAULT_DIR.glob("*.json"):
            try:
                doc = json.loads(f.read_text(encoding="utf-8"))
                task = doc.get("task", "")
                if "needs_new_skill" in task or doc.get("result", {}).get("tag") == "needs_new_skill":
                    # Nettoie le préfixe "[needs_new_skill] "
                    clean = re.sub(r"^\[needs_new_skill\]\s*", "", task).strip()
                    if not clean:
                        continue
                    # Déduplique par similarité
                    duplicate = any(
                        SequenceMatcher(None, clean.lower(), n.lower()).ratio() > 0.7
                        for n in needed
                    )
                    if not duplicate:
                        needed.append(clean)
            except Exception:
                pass

        self._log(f"scan_needed_skills:{len(needed)}", True)
        print(f"🔍 {len(needed)} skills manquants détectés")
        return needed

    # ─── 2. find_skill_for_task ───────────────────────────────────────────────

    def find_skill_for_task(self, task: str) -> dict | None:
        """
        Cherche le skill le plus pertinent.
        Priorité : local validé (success_rate ≥ 0.8) > marketplace > local faible score.
        """
        task_lower  = task.lower()
        best_local  = None
        best_market = None
        best_local_score  = 0.0
        best_market_score = 0.0

        for skill in self.atlas.get("skills", []):
            keywords = skill.get("trigger_keywords", [])
            if not keywords:
                continue
            hits  = sum(1 for kw in keywords if kw.lower() in task_lower)
            score = hits / len(keywords)

            if skill.get("source") == "marketplace":
                if score > best_market_score:
                    best_market_score = score
                    best_market       = skill
            else:
                if score > best_local_score:
                    best_local_score = score
                    best_local       = skill

        # Priorise local si bon taux de succès
        if best_local and best_local_score >= 0.3:
            if best_local.get("success_rate", 1.0) >= 0.8:
                print(f"🎯 Skill local : {best_local['name']} (score={best_local_score:.2f})")
                return best_local

        # Sinon marketplace
        if best_market and best_market_score >= 0.3:
            print(f"🛒 Skill marketplace : {best_market['name']} (score={best_market_score:.2f})")
            return best_market

        # Fallback local même avec faible succès
        if best_local and best_local_score >= 0.3:
            print(f"🎯 Skill local (fallback) : {best_local['name']}")
            return best_local

        return None

    # ─── 3. generate_skill ───────────────────────────────────────────────────

    def generate_skill(self, task: str, failed_attempts: list[dict]) -> str:
        """
        Génère le code Python d'un skill via NVIDIA NIM.
        Fallback Ollama si NIM indisponible.
        """
        approaches_tried = [a.get("diagnosis", str(a)) for a in failed_attempts]
        ts = datetime.now().strftime("%Y-%m-%d")

        prompt = (
            "Tu es un expert Python spécialisé en automatisation macOS.\n\n"
            f"TÂCHE QUI ÉCHOUE: {task}\n\n"
            f"TENTATIVES ÉCHOUÉES:\n{json.dumps(failed_attempts, indent=2, ensure_ascii=False)}\n\n"
            "OUTILS DISPONIBLES:\n"
            "- pyautogui (souris, clavier, screenshots)\n"
            "- subprocess (commandes shell, applescript)\n"
            "- PIL/Pillow (traitement images)\n"
            "- os, pathlib (fichiers)\n\n"
            "CONTRAINTES ABSOLUES:\n"
            "- La fonction doit s'appeler execute(params: dict) -> dict\n"
            '- Retourne toujours {"success": bool, "result": str, "error": str|None}\n'
            "- Timeout max 30 secondes\n"
            "- Pas d'imports non standard hors liste ci-dessus\n"
            "- Gère TOUTES les exceptions dans un try/except global\n"
            "- Utilise AppleScript via subprocess pour les actions macOS natives\n\n"
            f"APPROCHES À ÉVITER (déjà échouées):\n{approaches_tried}\n\n"
            "Génère UNIQUEMENT le code Python du skill, sans explication, sans backticks markdown.\n"
            "Commence directement par les docstrings du skill.\n"
            "Format obligatoire en tête de fichier :\n"
            f'"""\nSKILL: nom_snake_case\n'
            f"DESCRIPTION: description en une ligne\n"
            f"VERSION: 1.0.0\n"
            f"CREATED: {ts}\n"
            f'TRIGGER_KEYWORDS: [mot1, mot2, mot3, mot4, mot5]\n"""\n'
        )

        # Sélection du modèle : qwen3-coder si dispo, sinon NVIDIA NIM
        try:
            from core.model_router import ModelRouter
            _router = ModelRouter()
            _code_model = "qwen3-coder" if "qwen3-coder" in _router.available_models else None
            if _code_model:
                print(f"🤖 Génération skill via {_code_model}")
                code = _router.call_model(_code_model, prompt)
                code = re.sub(r"^```python\s*|^```\s*|```$", "", code, flags=re.MULTILINE).strip()
                if code:
                    self._log(f"generate_skill:qwen3-coder:{task[:40]}", True)
                    return code
        except Exception:
            pass

        # Tentative NVIDIA NIM
        if self.api_key:
            try:
                payload = {
                    "model": NVIDIA_TEXT_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 2048,
                }
                resp = requests.post(
                    NVIDIA_API_URL,
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                    json=payload,
                    timeout=45,
                )
                resp.raise_for_status()
                code = resp.json()["choices"][0]["message"]["content"]
                # Nettoie les backticks markdown si présents
                code = re.sub(r"^```python\s*|^```\s*|```$", "", code, flags=re.MULTILINE).strip()
                self._log(f"generate_skill:nvidia:{task[:40]}", True)
                return code
            except Exception as e:
                print(f"⚠️  NVIDIA NIM génération : {e} — fallback Ollama")

        # Fallback Ollama
        try:
            resp = requests.post(
                f"{self.ollama_url}/api/generate",
                json={"model": self.ollama_model, "prompt": prompt, "stream": False},
                timeout=60,
            )
            resp.raise_for_status()
            code = resp.json().get("response", "")
            code = re.sub(r"^```python\s*|^```\s*|```$", "", code, flags=re.MULTILINE).strip()
            self._log(f"generate_skill:ollama:{task[:40]}", True)
            return code
        except Exception as e:
            self._log(f"generate_skill:failed:{task[:40]}", False)
            return ""

    # ─── 4. validate_skill ───────────────────────────────────────────────────

    def validate_skill(self, code: str, skill_name: str) -> dict:
        """
        Valide le code en 4 étapes : syntaxe → structure → sécurité → sandbox.
        """
        result: dict = {"valid": True, "error": None, "warnings": []}

        if not code.strip():
            return {"valid": False, "error": "Code vide", "warnings": []}

        # ── Étape 1 : syntaxe ─────────────────────────────────────────────────
        try:
            ast.parse(code)
        except SyntaxError as e:
            return {"valid": False, "error": f"SyntaxError ligne {e.lineno}: {e.msg}", "warnings": []}

        # ── Étape 2 : structure ───────────────────────────────────────────────
        checks = [
            ("def execute(params",  "Fonction execute(params) manquante"),
            ("SKILL:",              "Métadonnée SKILL: manquante"),
            ("TRIGGER_KEYWORDS:",   "Métadonnée TRIGGER_KEYWORDS: manquante"),
            ('"success"',           'Clé "success" manquante dans le retour'),
        ]
        for pattern, msg in checks:
            if pattern not in code:
                return {"valid": False, "error": msg, "warnings": []}

        # ── Étape 3 : sécurité ────────────────────────────────────────────────
        for pattern in PATTERNS_DANGEREUX:
            if pattern in code:
                result["warnings"].append(f"Pattern dangereux : {pattern}")

        if len(result["warnings"]) > 2:
            result["valid"] = False
            result["error"] = f"Trop de patterns dangereux : {result['warnings']}"
            return result

        # ── Étape 4 : sandbox ─────────────────────────────────────────────────
        tmp_file = Path(f"/tmp/skill_test_{uuid.uuid4().hex[:8]}.py")
        try:
            tmp_file.write_text(code, encoding="utf-8")
            import subprocess
            proc = subprocess.run(
                ["python3", str(tmp_file)],
                capture_output=True,
                text=True,
                timeout=self.sandbox_timeout,
            )
            if proc.returncode != 0:
                result["valid"] = False
                result["error"] = f"Sandbox échec : {proc.stderr[:300]}"
        except subprocess.TimeoutExpired:
            result["valid"] = False
            result["error"] = f"Sandbox timeout (>{self.sandbox_timeout}s)"
        except Exception as e:
            result["valid"] = False
            result["error"] = f"Sandbox erreur : {e}"
        finally:
            tmp_file.unlink(missing_ok=True)

        return result

    # ─── 5. install_skill ────────────────────────────────────────────────────

    def install_skill(self, code: str, validation: dict) -> dict:
        """
        Extrait les métadonnées, sauvegarde le fichier, met à jour atlas.json.
        """
        empty = {"installed": False, "skill_id": "", "skill_name": "", "file_path": ""}

        if not validation.get("valid"):
            self._log("install_skill:invalid", False)
            return empty

        # ── Extraction métadonnées ────────────────────────────────────────────
        skill_name  = self._extract_meta(code, "SKILL")
        description = self._extract_meta(code, "DESCRIPTION")
        kw_raw      = self._extract_meta(code, "TRIGGER_KEYWORDS")

        if not skill_name:
            return {**empty, "installed": False}

        # Parse keywords : "[mot1, mot2]" ou "mot1, mot2"
        kw_raw  = kw_raw.strip("[]").replace('"', "").replace("'", "")
        keywords = [k.strip() for k in kw_raw.split(",") if k.strip()]

        skill_id   = f"skill_{uuid.uuid4().hex[:8]}"
        file_path  = SKILLS_DIR / f"{skill_name}.py"

        # ── Sauvegarde fichier ────────────────────────────────────────────────
        tmp = file_path.with_suffix(".tmp")
        tmp.write_text(code, encoding="utf-8")
        tmp.rename(file_path)

        # ── Mise à jour atlas ─────────────────────────────────────────────────
        entry = {
            "id":               skill_id,
            "name":             skill_name,
            "file":             f"skills/{skill_name}.py",
            "description":      description,
            "trigger_keywords": keywords,
            "success_rate":     1.0,
            "usage_count":      0,
            "created_at":       datetime.now().isoformat(),
            "last_used":        None,
            "auto_generated":   True,
            "validated":        True,
        }

        skills = self.atlas.setdefault("skills", [])
        idx = next((i for i, s in enumerate(skills) if s["name"] == skill_name), None)
        if idx is not None:
            skills[idx] = entry
        else:
            skills.append(entry)

        # Bump version mineure
        self._bump_version()
        self._save_atlas()

        self._log(f"install_skill:{skill_name}", True)
        print(f"✅ Skill '{skill_name}' installé → {file_path}")
        return {"installed": True, "skill_id": skill_id, "skill_name": skill_name, "file_path": str(file_path)}

    # ─── 6. run_skill ────────────────────────────────────────────────────────

    def run_skill(self, skill_name: str, params: dict = None) -> dict:
        """Charge et exécute un skill, met à jour les stats dans atlas."""
        params = params or {}

        skill_entry = next(
            (s for s in self.atlas.get("skills", []) if s["name"] == skill_name),
            None,
        )

        # Résolution du fichier
        if skill_entry:
            file_rel = skill_entry.get("file") or skill_entry.get("path", "")
            skill_file = BASE_DIR / file_rel if file_rel else SKILLS_DIR / f"{skill_name}.py"
        else:
            skill_file = SKILLS_DIR / f"{skill_name}.py"

        # Routing marketplace
        if skill_entry and skill_entry.get("source") == "marketplace":
            task = params.get("task", params.get("description", str(params)))
            return self.marketplace.execute_marketplace_skill(skill_entry["name"], task)

        if not skill_file.exists():
            return {"success": False, "result": "", "error": f"Fichier skill introuvable : {skill_file}"}

        try:
            spec   = importlib.util.spec_from_file_location(skill_name, str(skill_file))
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            if not hasattr(module, "execute"):
                return {"success": False, "result": "", "error": "Fonction execute() manquante"}

            result = module.execute(params)
            ok     = bool(result.get("success", False)) if isinstance(result, dict) else False

            # Mise à jour stats atlas
            if skill_entry:
                skill_entry["usage_count"] = skill_entry.get("usage_count", 0) + 1
                skill_entry["last_used"]   = datetime.now().isoformat()
                # Moyenne glissante sur 20 derniers appels
                sr  = skill_entry.get("success_rate", 1.0)
                cnt = min(skill_entry["usage_count"], 20)
                skill_entry["success_rate"] = round((sr * (cnt - 1) + (1.0 if ok else 0.0)) / cnt, 3)
                self._save_atlas()

            self._log(f"run_skill:{skill_name}", ok)
            return result if isinstance(result, dict) else {"success": ok, "result": str(result), "error": None}

        except Exception as e:
            self._log(f"run_skill:{skill_name}:error", False)
            return {"success": False, "result": "", "error": str(e)}

    # ─── 7. auto_discover ────────────────────────────────────────────────────

    def auto_discover(self) -> list[dict]:
        """
        Pipeline complet : scan vault → génère → valide → installe.
        Appelé en arrière-plan au démarrage de MainBrain.
        """
        tasks   = self.scan_needed_skills()
        created = []

        for task in tasks:
            print(f"\n🔧 Génération skill pour : {task[:60]}")

            # Récupère les expériences d'échec liées à cette tâche
            failed_attempts = self._load_failed_attempts(task)

            success = False
            for attempt in range(3):
                code       = self.generate_skill(task, failed_attempts)
                skill_name = self._extract_meta(code, "SKILL") or f"skill_{uuid.uuid4().hex[:6]}"
                validation = self.validate_skill(code, skill_name)

                if validation["valid"]:
                    result = self.install_skill(code, validation)
                    if result["installed"]:
                        # Retire le tag du vault
                        self._clear_needs_skill_tag(task)
                        # Notifie via memory working_memory
                        try:
                            from core.memory import AgentMemory
                            mem = AgentMemory.__new__(AgentMemory)
                            mem._state = {}
                            mem.update_working_memory(
                                f"skill_created:{result['skill_name']}",
                                f"Skill généré pour : {task[:50]}",
                            )
                        except Exception:
                            pass
                        created.append(result)
                        success = True
                        break
                else:
                    print(f"⚠️  Tentative {attempt+1}/3 invalide : {validation['error']}")
                    failed_attempts.append({"diagnosis": validation["error"]})

            if not success:
                print(f"❌ Impossible de générer skill pour : {task[:50]}")
                self._mark_generation_failed(task)

        return created

    # ─── Helpers privés ───────────────────────────────────────────────────────

    def _extract_meta(self, code: str, key: str) -> str:
        """Extrait une valeur depuis les métadonnées en tête de fichier."""
        match = re.search(rf"^{key}:\s*(.+)$", code, re.MULTILINE | re.IGNORECASE)
        return match.group(1).strip() if match else ""

    def _bump_version(self) -> None:
        """Incrémente la version mineure de l'atlas (1.0.0 → 1.1.0)."""
        ver = self.atlas.get("version", "2.0.0")
        parts = ver.split(".")
        if len(parts) == 3:
            parts[1] = str(int(parts[1]) + 1)
            self.atlas["version"] = ".".join(parts)

    def _load_failed_attempts(self, task: str) -> list[dict]:
        """Charge les expériences d'échec similaires depuis vault/."""
        attempts = []
        for f in VAULT_DIR.glob("exp_*.json"):
            try:
                doc   = json.loads(f.read_text(encoding="utf-8"))
                ratio = SequenceMatcher(None, task.lower(), doc.get("task", "").lower()).ratio()
                if ratio > 0.6 and not doc.get("result", {}).get("success", True):
                    attempts.append({
                        "task":      doc.get("task", "")[:80],
                        "diagnosis": doc.get("result", {}).get("reflections", ["inconnu"])[0]
                                     if isinstance(doc.get("result", {}).get("reflections"), list)
                                     else "inconnu",
                        "screen":    doc.get("screen_after", "")[:100],
                    })
            except Exception:
                pass
        return attempts[:5]

    def _clear_needs_skill_tag(self, task: str) -> None:
        """Retire le tag needs_new_skill des fichiers vault correspondants."""
        for f in VAULT_DIR.glob("*.json"):
            try:
                doc = json.loads(f.read_text(encoding="utf-8"))
                if "[needs_new_skill]" in doc.get("task", ""):
                    clean = re.sub(r"^\[needs_new_skill\]\s*", "", doc["task"]).strip()
                    if SequenceMatcher(None, clean.lower(), task.lower()).ratio() > 0.7:
                        doc["task"] = clean
                        doc["skill_generated"] = True
                        tmp = f.with_suffix(".tmp")
                        tmp.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
                        tmp.rename(f)
            except Exception:
                pass

    def _mark_generation_failed(self, task: str) -> None:
        """Marque dans vault que la génération a échoué."""
        for f in VAULT_DIR.glob("*.json"):
            try:
                doc = json.loads(f.read_text(encoding="utf-8"))
                if SequenceMatcher(None, task.lower(), doc.get("task", "").lower()).ratio() > 0.7:
                    doc["skill_generation_failed"] = True
                    tmp = f.with_suffix(".tmp")
                    tmp.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
                    tmp.rename(f)
            except Exception:
                pass

    def _log(self, action: str, success: bool) -> None:
        ACTIONS_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(ACTIONS_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps({
                "timestamp": datetime.now().isoformat(),
                "module":    "meta/skill_factory",
                "action":    action,
                "success":   success,
            }, ensure_ascii=False) + "\n")


# ─── Bloc de test ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    factory = SkillFactory()

    # TEST 1 — Validation d'un skill correct
    test_code = '''"""
SKILL: test_hello
DESCRIPTION: Skill de test minimal
VERSION: 1.0.0
CREATED: 2024-01-01
TRIGGER_KEYWORDS: [test, hello, bonjour, demo, exemple]
"""

def execute(params: dict) -> dict:
    try:
        message = params.get("message", "Hello PICO!")
        return {"success": True, "result": message, "error": None}
    except Exception as e:
        return {"success": False, "result": "", "error": str(e)}

if __name__ == "__main__":
    result = execute({"message": "test OK"})
    print(result)
'''

    validation = factory.validate_skill(test_code, "test_hello")
    assert validation["valid"] is True, f"Validation échouée : {validation}"
    print(f"✅ TEST 1 — Validation : {validation}")

    # TEST 2 — Installation
    install_result = factory.install_skill(test_code, validation)
    assert install_result["installed"] is True, f"Install échouée : {install_result}"
    print(f"✅ TEST 2 — Installation : {install_result['skill_name']}")

    # TEST 3 — Recherche par keywords
    found = factory.find_skill_for_task("fais un test de demo")
    assert found is not None, "Skill non trouvé"
    assert found["name"] == "test_hello", f"Mauvais skill : {found['name']}"
    print(f"✅ TEST 3 — Recherche : {found['name']} trouvé")

    # TEST 4 — Exécution
    run_result = factory.run_skill("test_hello", {"message": "PICO fonctionne!"})
    assert run_result["success"] is True, f"Exécution échouée : {run_result}"
    print(f"✅ TEST 4 — Exécution : {run_result['result']}")

    # TEST 5 — Scan vault
    needed = factory.scan_needed_skills()
    print(f"✅ TEST 5 — Scan vault : {len(needed)} skills manquants")

    print("\n🏭 SkillFactory autonome opérationnelle — 5/5 ✅")
