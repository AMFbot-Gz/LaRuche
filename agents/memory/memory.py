"""
core/memory.py — Mémoire Long Terme Sémantique de PICO

Trois couches :
  1. Mémoire de Travail  → memory/state.json         (10 dernières actions)
  2. Mémoire Épisodique  → memory/vector_store/       (ChromaDB, embeddings 384d)
  3. Mémoire Sémantique  → memory/patterns.json       (patterns extraits par KMeans)
"""

import json
import logging
import os
import re
import threading
import time
import uuid
from collections import OrderedDict
from datetime import datetime
from pathlib import Path

import numpy as np

BASE_DIR      = Path(__file__).parent.parent
STATE_FILE    = BASE_DIR / "memory" / "state.json"
VAULT_DIR     = BASE_DIR / "vault"
VECTOR_DIR    = BASE_DIR / "memory" / "vector_store"
PATTERNS_FILE = BASE_DIR / "memory" / "patterns.json"
ACTIONS_LOG   = BASE_DIR / "memory" / "actions.log"

_DEFAULT_STATE = {
    "tasks_success":  0,
    "tasks_failed":   0,
    "last_screen":    "",
    "current_goal":   "",
    "working_memory": [],
    "uptime_start":   None,
    "total_actions":  0,
}

logging.basicConfig(level=logging.WARNING)


# ─── Cache LRU simple ────────────────────────────────────────────────────────

class _LRUCache:
    def __init__(self, maxsize: int = 100):
        self._cache: OrderedDict = OrderedDict()
        self._maxsize = maxsize

    def get(self, key: str):
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def set(self, key: str, value):
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = value
        if len(self._cache) > self._maxsize:
            self._cache.popitem(last=False)


# ─── Classe principale ───────────────────────────────────────────────────────

class AgentMemory:

    def __init__(self):
        # Lock thread-safe pour toutes les opérations sur _state
        self._lock = threading.RLock()

        # Dossiers
        VAULT_DIR.mkdir(parents=True, exist_ok=True)
        VECTOR_DIR.mkdir(parents=True, exist_ok=True)
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

        # État courant
        self._state = self._load_or_create_state()
        if not self._state.get("uptime_start"):
            self._state["uptime_start"] = time.time()
            self._save_state()

        # Modèle d'embeddings — chargé une seule fois
        self._encoder = None
        self._embed_cache = _LRUCache(100)
        self._load_encoder()

        # ChromaDB
        self._chroma = None
        self._collection = None
        self._init_chromadb()

        n = self._count_experiences()
        print(f"🧠 Mémoire vectorielle initialisée — {n} expériences chargées")

    # ─── Chargement modèle ────────────────────────────────────────────────────

    def _load_encoder(self):
        # fastembed — pure ONNX, pas de PyTorch, compatible numpy 2.x
        try:
            from fastembed import TextEmbedding
            self._encoder = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
            self._encoder_type = "fastembed"
        except Exception as e:
            logging.warning(f"fastembed indisponible : {e}")
            self._encoder = None
            self._encoder_type = "none"

    # ─── ChromaDB ────────────────────────────────────────────────────────────

    def _init_chromadb(self):
        try:
            import chromadb
            self._chroma = chromadb.PersistentClient(path=str(VECTOR_DIR))
            self._collection = self._chroma.get_or_create_collection(
                name="experiences",
                metadata={"hnsw:space": "cosine"},
            )
        except Exception as e:
            logging.warning(f"ChromaDB indisponible : {e} — fallback texte activé")
            self._chroma = None
            self._collection = None

    def _count_experiences(self) -> int:
        if self._collection:
            try:
                return self._collection.count()
            except Exception:
                pass
        return len(list(VAULT_DIR.glob("exp_*.json")))

    # ─── 1. encode ───────────────────────────────────────────────────────────

    def encode(self, text: str) -> np.ndarray:
        """Encode un texte → vecteur numpy normalisé (384d). Cache LRU 100."""
        cached = self._embed_cache.get(text)
        if cached is not None:
            return cached

        if self._encoder is None:
            vec = np.zeros(384, dtype=np.float32)
            self._embed_cache.set(text, vec)
            return vec

        try:
            # fastembed retourne un générateur → next()
            vec = next(self._encoder.embed([text]))
            vec = np.array(vec, dtype=np.float32)
            # normalisation L2
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            self._embed_cache.set(text, vec)
            return vec
        except Exception as e:
            logging.warning(f"encode: erreur — {e}")
            return np.zeros(384, dtype=np.float32)

    # ─── 2. save_experience ──────────────────────────────────────────────────

    def save_experience(
        self,
        task: str,
        plan: dict = None,
        result: dict = None,
        screen_before: str = "",
        screen_after: str = "",
        # compat ancienne API
        steps_taken: list = None,
        success: bool = None,
        notes: str = "",
    ) -> str:
        """
        Sauvegarde une expérience dans ChromaDB + vault/.
        Accepte l'ancienne signature (steps_taken, success, notes) pour rétrocompat.
        Retourne l'ID (ou chemin str) de l'expérience.
        """
        # ── Normalisation ancienne → nouvelle signature ───────────────────────
        if result is None:
            _success = success if success is not None else True
            result = {
                "success":         _success,
                "steps_completed": len(steps_taken) if steps_taken else 0,
                "steps_total":     len(steps_taken) if steps_taken else 0,
                "notes":           notes,
            }
        if plan is None:
            plan = {"steps": steps_taken or []}

        exp_id  = f"exp_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        ok      = bool(result.get("success", False))
        now_iso = datetime.now().isoformat()

        embedding_text = f"{task} {result} {screen_after}"

        doc = {
            "id":              exp_id,
            "task":            task,
            "plan":            plan,
            "result":          result,
            "success":         ok,
            "steps_completed": result.get("steps_completed", 0),
            "steps_total":     result.get("steps_total", 0),
            "screen_before":   screen_before,
            "screen_after":    screen_after,
            "timestamp":       now_iso,
            "embedding_text":  embedding_text,
        }

        # ── Sauvegarde JSON brut (atomique) ──────────────────────────────────
        tmp   = VAULT_DIR / f"{exp_id}.tmp"
        final = VAULT_DIR / f"{exp_id}.json"
        try:
            tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.rename(final)
        except Exception as e:
            logging.error(f"save_experience: écriture vault — {e}")

        # ── ChromaDB ─────────────────────────────────────────────────────────
        if self._collection:
            try:
                vec = self.encode(embedding_text).tolist()
                self._collection.add(
                    ids=[exp_id],
                    embeddings=[vec],
                    documents=[embedding_text],
                    metadatas=[{
                        "success":         ok,
                        "timestamp":       time.time(),
                        "task_short":      task[:100],
                        "screen_after":    screen_after[:200],
                        "steps_completed": result.get("steps_completed", 0),
                        "steps_total":     result.get("steps_total", 0),
                    }],
                )
            except Exception as e:
                logging.error(f"save_experience: ChromaDB — {e}")

        # ── Mise à jour state ─────────────────────────────────────────────────
        key = "tasks_success" if ok else "tasks_failed"
        self._state[key] = self._state.get(key, 0) + 1
        self._state["total_actions"] = self._state.get("total_actions", 0) + 1
        self._save_state()

        # ── Patterns tous les 10 ─────────────────────────────────────────────
        total = self._state.get("tasks_success", 0) + self._state.get("tasks_failed", 0)
        if total > 0 and total % 10 == 0:
            try:
                self._extract_patterns()
            except Exception as e:
                logging.warning(f"_extract_patterns: {e}")

        self._log(f"save_experience:{exp_id}", ok)
        return str(final)  # compat ancienne API qui retourne un chemin

    # ─── 3. get_context_for_task ─────────────────────────────────────────────

    def get_context_for_task(self, task: str, n_results: int = 5) -> str:
        """
        Retourne un bloc de contexte formaté avec les expériences les plus
        pertinentes, scorées par similarité + succès + fraîcheur.
        """
        results = self._query_chroma(task, n_results=n_results * 2)

        if not results:
            return self._fallback_search(task)

        now_ts = time.time()
        scored = []
        for r in results:
            sim      = r.get("similarity", 0.5)
            success  = r["metadata"].get("success", False)
            ts       = r["metadata"].get("timestamp", now_ts)
            days_old = (now_ts - ts) / 86400
            freshness = 1.0 / (1.0 + days_old)

            score = (
                0.5 * sim
                + 0.3 * (1.0 if success else -0.5)
                + 0.2 * freshness
            )
            scored.append({**r, "score": score})

        scored.sort(key=lambda x: x["score"], reverse=True)
        top = scored[:n_results]

        lines = ["EXPÉRIENCES PERTINENTES :"]
        for i, r in enumerate(top, 1):
            meta   = r["metadata"]
            icon   = "✅" if meta.get("success") else "❌"
            task_s = meta.get("task_short", "?")
            sc     = meta.get("steps_completed", "?")
            st     = meta.get("steps_total", "?")
            ts     = meta.get("timestamp", now_ts)
            days   = int((now_ts - ts) / 86400)
            screen = meta.get("screen_after", "")[:100]
            note   = "" if meta.get("success") else " (échec — éviter cette approche)"
            lines.append(
                f"[{i}] {icon} Tâche: {task_s} | Résultat: {sc}/{st} | Il y a {days}j{note}"
            )
            if screen:
                lines.append(f"     Écran après: {screen}")

        return "\n".join(lines)

    # ─── 4. get_similar_failures ─────────────────────────────────────────────

    def get_similar_failures(self, task: str, n: int = 3) -> list[dict]:
        """Retourne les n échecs les plus similaires à task."""
        results = self._query_chroma(task, n_results=20, where={"success": False})
        out = []
        for r in results[:n]:
            meta = r["metadata"]
            out.append({
                "task_short":   meta.get("task_short", ""),
                "timestamp":    meta.get("timestamp", 0),
                "screen_after": meta.get("screen_after", ""),
            })
        return out

    # ─── 5. search_experiences (compat ancienne API) ──────────────────────────

    def search_experiences(self, keywords: list) -> list[dict]:
        """Rétrocompatibilité — recherche par mots-clés via ChromaDB ou texte."""
        task = " ".join(keywords)
        results = self._query_chroma(task, n_results=3)
        if results:
            return [
                {
                    "file":    r["id"],
                    "preview": r["document"][:200],
                    "score":   r.get("similarity", 0),
                }
                for r in results
            ]
        # Fallback texte
        out = []
        for f in VAULT_DIR.glob("exp_*.json"):
            try:
                content = f.read_text(encoding="utf-8").lower()
                score = sum(1 for kw in keywords if kw.lower() in content)
                if score > 0:
                    out.append({"file": str(f), "preview": content[:200], "score": score})
            except Exception:
                pass
        out.sort(key=lambda x: x["score"], reverse=True)
        return out[:3]

    # ─── 6. _extract_patterns ────────────────────────────────────────────────

    def _extract_patterns(self) -> None:
        """Regroupe les expériences en clusters KMeans et sauvegarde patterns.json."""
        if not self._collection:
            return
        try:
            all_data = self._collection.get(include=["embeddings", "metadatas", "documents"])
        except Exception as e:
            logging.warning(f"_extract_patterns get: {e}")
            return

        embeddings = all_data.get("embeddings") or []
        metadatas  = all_data.get("metadatas")  or []
        documents  = all_data.get("documents")  or []

        if len(embeddings) < 5:
            return

        try:
            from sklearn.cluster import KMeans
        except ImportError:
            return

        X  = np.array(embeddings, dtype=np.float32)
        k  = min(5, len(X))
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(X)

        clusters = []
        for cid in range(k):
            idxs = [i for i, l in enumerate(labels) if int(l) == cid]
            if not idxs:
                continue

            cluster_meta = [metadatas[i] for i in idxs]
            cluster_docs = [documents[i]  for i in idxs]

            successes    = [m.get("success", False) for m in cluster_meta]
            success_rate = sum(successes) / len(successes)

            words: dict[str, int] = {}
            for doc in cluster_docs:
                for w in re.findall(r"[a-zA-ZÀ-ÿ]{4,}", doc.lower()):
                    words[w] = words.get(w, 0) + 1
            top_kw = sorted(words, key=lambda w: words[w], reverse=True)[:5]

            best = next(
                (metadatas[i].get("task_short", "") for i in idxs if metadatas[i].get("success")),
                "",
            )

            clusters.append({
                "id":            cid,
                "keywords":      top_kw,
                "success_rate":  round(success_rate, 2),
                "count":         len(idxs),
                "best_approach": best,
            })

        patterns = {"updated_at": datetime.now().isoformat(), "clusters": clusters}
        tmp = PATTERNS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(patterns, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.rename(PATTERNS_FILE)
        self._log("_extract_patterns", True)

    # ─── 7. get_patterns_for_task ────────────────────────────────────────────

    def get_patterns_for_task(self, task: str) -> str:
        """Retourne le pattern connu le plus proche de task."""
        if not PATTERNS_FILE.exists():
            return ""
        try:
            data = json.loads(PATTERNS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return ""

        task_words   = set(re.findall(r"[a-zA-ZÀ-ÿ]{4,}", task.lower()))
        best_cluster = None
        best_score   = 0

        for c in data.get("clusters", []):
            score = len(task_words & set(c.get("keywords", [])))
            if score > best_score:
                best_score   = score
                best_cluster = c

        if not best_cluster or best_score == 0:
            return ""

        rate     = int(best_cluster["success_rate"] * 100)
        approach = best_cluster.get("best_approach", "")
        return (
            f"PATTERN CONNU: succès {rate}% pour tâches similaires."
            + (f" Meilleure approche: {approach}" if approach else "")
        )

    # ─── 8. compress_old_memories ────────────────────────────────────────────

    def compress_old_memories(self, keep_days: int = 30) -> int:
        """Compresse les expériences de plus de keep_days jours. Retourne le nombre compressé."""
        if not self._collection:
            return 0

        cutoff = time.time() - keep_days * 86400
        try:
            all_data = self._collection.get(include=["metadatas", "documents"])
        except Exception:
            return 0

        ids       = all_data.get("ids", [])
        metadatas = all_data.get("metadatas", [])
        documents = all_data.get("documents", [])

        old_ids = [
            ids[i] for i, m in enumerate(metadatas)
            if m.get("timestamp", time.time()) < cutoff
        ]
        if not old_ids:
            return 0

        compressed = 0
        for i in range(0, len(old_ids), 10):
            batch_ids  = old_ids[i: i + 10]
            batch_docs = [documents[ids.index(bid)] for bid in batch_ids if bid in ids]

            summary = {
                "type":       "compressed_summary",
                "source_ids": batch_ids,
                "doc_count":  len(batch_docs),
                "summary":    " | ".join(d[:80] for d in batch_docs),
                "created_at": datetime.now().isoformat(),
            }
            ts   = int(time.time())
            tmp  = VAULT_DIR / f"summary_{ts}.tmp"
            dest = VAULT_DIR / f"summary_{ts}.json"
            tmp.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
            tmp.rename(dest)

            try:
                self._collection.delete(ids=batch_ids)
            except Exception as e:
                logging.warning(f"compress delete: {e}")

            compressed += len(batch_ids)

        self._log(f"compress_old_memories:{compressed}", True)
        return compressed

    # ─── 9. get_state ────────────────────────────────────────────────────────

    def get_state(self) -> dict:
        """Retourne une copie thread-safe de l'état courant avec uptime."""
        with self._lock:
            state = dict(self._state)
        start = state.get("uptime_start") or time.time()
        state["uptime"] = int(time.time() - start)
        return state

    # ─── 10. update_working_memory ───────────────────────────────────────────

    def update_working_memory(self, action: str, result: str) -> None:
        """Ajoute une action à la mémoire de travail (FIFO, max 10)."""
        with self._lock:
            wm = self._state.get("working_memory", [])
            wm.append({"action": action, "result": result, "ts": datetime.now().isoformat()})
            self._state["working_memory"] = wm[-10:]
            self._save_state()

    # ─── update_state (compat ascendante) ────────────────────────────────────

    def update_state(self, key: str, value) -> None:
        """Rétrocompatibilité — met à jour une clé dans state.json."""
        with self._lock:
            self._state[key] = value
            self._save_state()

    # ─── Helpers privés ──────────────────────────────────────────────────────

    def _query_chroma(
        self,
        task: str,
        n_results: int = 5,
        where: dict | None = None,
    ) -> list[dict]:
        if not self._collection:
            return []
        try:
            count = self._collection.count()
            if count == 0:
                return []
            n   = min(n_results, count)
            vec = self.encode(task).tolist()

            kwargs: dict = dict(
                query_embeddings=[vec],
                n_results=n,
                include=["metadatas", "distances", "documents"],
            )
            if where:
                kwargs["where"] = where

            res            = self._collection.query(**kwargs)
            ids_list       = res.get("ids",       [[]])[0]
            metadatas_list = res.get("metadatas", [[]])[0]
            distances_list = res.get("distances", [[]])[0]
            documents_list = res.get("documents", [[]])[0]

            out = []
            for eid, meta, dist, doc in zip(
                ids_list, metadatas_list, distances_list, documents_list
            ):
                out.append({
                    "id":         eid,
                    "metadata":   meta,
                    "similarity": max(0.0, 1.0 - dist),
                    "document":   doc,
                })
            return out
        except Exception as e:
            logging.warning(f"_query_chroma: {e}")
            return []

    def _fallback_search(self, task: str) -> str:
        words = re.findall(r"[a-zA-ZÀ-ÿ]{4,}", task.lower())
        if not words:
            return ""
        results = []
        for f in VAULT_DIR.glob("exp_*.json"):
            try:
                content = f.read_text(encoding="utf-8").lower()
                score   = sum(1 for w in words if w in content)
                if score > 0:
                    results.append((score, f))
            except Exception:
                pass
        results.sort(reverse=True)
        lines = ["EXPÉRIENCES PERTINENTES (fallback texte) :"]
        for score, f in results[:3]:
            lines.append(f"  [{score}] {f.name}")
        return "\n".join(lines) if len(lines) > 1 else ""

    def _load_or_create_state(self) -> dict:
        if STATE_FILE.exists():
            try:
                loaded = json.loads(STATE_FILE.read_text(encoding="utf-8"))
                state  = dict(_DEFAULT_STATE)
                state.update(loaded)
                return state
            except Exception as e:
                logging.warning(f"_load_or_create_state : état corrompu, reset — {e}")
        state = dict(_DEFAULT_STATE)
        self._write_state(state)
        return state

    def _save_state(self) -> None:
        # Appelé depuis des méthodes déjà sous _lock — pas besoin de re-locker
        self._write_state(self._state)

    def _write_state(self, state: dict) -> None:
        tmp = STATE_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.rename(STATE_FILE)

    def _log(self, action: str, success: bool) -> None:
        ACTIONS_LOG.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "timestamp": datetime.now().isoformat(),
            "module":    "core/memory",
            "action":    action,
            "success":   success,
        }
        with open(ACTIONS_LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


# ─── Bloc de test ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mem = AgentMemory()

    print("\n─── Injection de 5 expériences ───")
    experiences = [
        ("ouvre Safari",        True,  "navigateur ouvert"),
        ("clique sur Google",   True,  "google chargé"),
        ("ouvre Safari",        False, "échec timeout"),
        ("tape du texte",       True,  "texte saisi"),
        ("scroll vers le bas",  True,  "page scrollée"),
    ]
    for task, success, screen in experiences:
        eid = mem.save_experience(
            task=task,
            plan={"steps": [{"action": "click"}]},
            result={"success": success, "steps_completed": 1, "steps_total": 1},
            screen_before="écran initial",
            screen_after=screen,
        )
        icon = "✅" if success else "❌"
        print(f"  {icon} {task} → {Path(eid).name}")

    print("\n🔍 Recherche : 'lance le navigateur web'")
    ctx = mem.get_context_for_task("lance le navigateur web")
    print(ctx)

    print("\n⚠️  Échecs similaires à 'ouvre Safari' :")
    fails = mem.get_similar_failures("ouvre Safari")
    for f in fails:
        print(f"  - {f['task_short']} — ts:{int(f['timestamp'])}")

    state = mem.get_state()
    print(f"\n📊 État : {state['tasks_success']}✅  {state['tasks_failed']}❌  uptime:{state['uptime']}s")

    print("\n✅ Mémoire vectorielle opérationnelle")
