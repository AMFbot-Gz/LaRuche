"""
packages/resilience/circuit_breaker.py — Résilience réseau pour Chimera

Module partagé importable par tous les agents Python.
Adapté depuis ruche-corps/core/resilience.py.

OllamaClient : client HTTP pour Ollama avec :
  - Circuit breaker maison (pas de dépendance pybreaker) :
      5 échecs → circuit ouvert → requêtes bloquées
      30s plus tard → half-open → 1 essai autorisé
      succès → circuit refermé
  - Backoff exponentiel + jitter ±25% : 1s → 2s → 4s → 8s → 16s
  - Logging structuré de chaque retry et transition d'état

Usage :
    from packages.resilience.circuit_breaker import get_ollama_client

    client = get_ollama_client()
    response = await client.chat({
        "model": "llama3.2:3b",
        "messages": [{"role": "user", "content": "Bonjour"}],
        "stream": False,
    })

Singleton via get_ollama_client() — une seule instance partagée par agent.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time

import httpx

# ─── Config ───────────────────────────────────────────────────────────────────

OLLAMA = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

log = logging.getLogger("chimera.resilience.circuit_breaker")


# ─── Exception personnalisée ──────────────────────────────────────────────────


class CircuitOpenError(Exception):
    """Levée quand le circuit breaker est ouvert (Ollama considéré HS)."""
    pass


# ─── OllamaClient ─────────────────────────────────────────────────────────────


class OllamaClient:
    """
    Client HTTP résilient pour Ollama.

    Chaque appel .chat() est protégé par un circuit breaker et un backoff
    exponentiel avec jitter. Implémentation 100% async sans dépendances externes.

    États du circuit :
      - closed   : fonctionnement normal
      - open     : bloqué (trop d'échecs) — requêtes rejetées immédiatement
      - half-open: 1 essai autorisé après reset_timeout

    Le client est conçu pour être partagé comme singleton dans un agent.
    """

    # Délais de backoff exponentiel en secondes
    _BACKOFF_DELAYS: list[int] = [1, 2, 4, 8, 16]

    def __init__(
        self,
        fail_max: int = 5,
        reset_timeout: int = 30,
        ollama_host: str | None = None,
    ) -> None:
        self._fail_count: int = 0
        self._fail_max: int = fail_max
        self._reset_timeout: int = reset_timeout
        self._open_since: float | None = None
        self._state: str = "closed"  # "closed" | "open" | "half-open"
        self._ollama: str = ollama_host or OLLAMA

    # ── Gestion d'état ────────────────────────────────────────────────────────

    def _is_open(self) -> bool:
        """Retourne True si le circuit est ouvert (requêtes à bloquer)."""
        if self._state == "closed":
            return False

        if self._state == "open":
            # Vérifie si le timeout de reset est écoulé → passe en half-open
            if self._open_since and (time.monotonic() - self._open_since) >= self._reset_timeout:
                self._state = "half-open"
                log.info(
                    "circuit_breaker_half_open — service=ollama reset_timeout=%ds",
                    self._reset_timeout,
                )
                return False
            return True

        # half-open : on laisse passer un essai
        return False

    @property
    def state(self) -> str:
        """État actuel du circuit breaker."""
        return self._state

    @property
    def fail_count(self) -> int:
        return self._fail_count

    def _record_success(self) -> None:
        if self._state in ("half-open", "open"):
            log.info(
                "circuit_breaker_closed — service=ollama previous_state=%s",
                self._state,
            )
        self._fail_count = 0
        self._state = "closed"
        self._open_since = None

    def _record_failure(self, exc: Exception) -> None:
        self._fail_count += 1
        log.error(
            "circuit_breaker_failure — service=ollama fail=%d/%d error=%s",
            self._fail_count,
            self._fail_max,
            exc,
        )
        if self._fail_count >= self._fail_max and self._state == "closed":
            self._state = "open"
            self._open_since = time.monotonic()
            log.warning(
                "circuit_breaker_opened — service=ollama fail_count=%d reset_in=%ds",
                self._fail_count,
                self._reset_timeout,
            )

    # ── Interface publique ────────────────────────────────────────────────────

    async def chat(self, payload: dict) -> dict:
        """
        Envoie un payload à /api/chat d'Ollama.

        Réessaie avec backoff exponentiel + jitter sur les erreurs réseau.
        Lève CircuitOpenError si le circuit est ouvert.

        Args:
            payload: dict conforme à l'API Ollama /api/chat

        Returns:
            dict: réponse JSON d'Ollama

        Raises:
            CircuitOpenError: si le circuit breaker est ouvert
            httpx.HTTPError: si toutes les tentatives échouent
        """
        if self._is_open():
            log.warning("circuit_open_request_blocked — state=%s", self._state)
            raise CircuitOpenError(
                f"Circuit breaker ouvert — Ollama considéré indisponible "
                f"(fail_count={self._fail_count})."
            )

        last_exc: Exception | None = None

        for attempt, delay in enumerate(self._BACKOFF_DELAYS):
            try:
                result = await self._do_chat(payload)
                self._record_success()
                if attempt > 0:
                    log.info("ollama_retry_success — attempt=%d", attempt + 1)
                return result

            except (
                httpx.ConnectError,
                httpx.TimeoutException,
                httpx.RemoteProtocolError,
                httpx.HTTPStatusError,
            ) as exc:
                last_exc = exc
                self._record_failure(exc)

                # Si le circuit vient de s'ouvrir, arrêt immédiat
                if self._state == "open":
                    raise CircuitOpenError(
                        f"Circuit ouvert après {self._fail_count} échecs."
                    ) from exc

                # Jitter ±25% pour éviter les tempêtes de retry
                jitter = delay * random.uniform(-0.25, 0.25)
                wait = max(0.1, delay + jitter)

                log.warning(
                    "ollama_retry — attempt=%d/%d wait=%.2fs error=%s",
                    attempt + 1,
                    len(self._BACKOFF_DELAYS),
                    wait,
                    exc,
                )

                # Pas de sleep après la dernière tentative
                if attempt < len(self._BACKOFF_DELAYS) - 1:
                    await asyncio.sleep(wait)

        # Toutes les tentatives épuisées
        if last_exc is None:
            last_exc = RuntimeError("OllamaClient: toutes les tentatives ont échoué")

        log.error(
            "ollama_all_retries_exhausted — attempts=%d error=%s",
            len(self._BACKOFF_DELAYS),
            last_exc,
        )
        raise last_exc

    async def _do_chat(self, payload: dict) -> dict:
        """Effectue l'appel HTTP réel (nouvelle connexion à chaque fois)."""
        async with httpx.AsyncClient(timeout=180.0) as c:
            resp = await c.post(f"{self._ollama}/api/chat", json=payload)
            resp.raise_for_status()
            return resp.json()

    async def is_available(self) -> bool:
        """Vérifie si Ollama est disponible (appel /api/tags)."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as c:
                resp = await c.get(f"{self._ollama}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False

    def reset(self) -> None:
        """Réinitialise manuellement le circuit breaker (utile pour les tests)."""
        self._fail_count = 0
        self._state = "closed"
        self._open_since = None
        log.info("circuit_breaker_manually_reset — service=ollama")


# ─── Singleton ────────────────────────────────────────────────────────────────

_ollama_client: OllamaClient | None = None


def get_ollama_client() -> OllamaClient:
    """
    Retourne le singleton OllamaClient (création lazy).

    Utilise OLLAMA_HOST depuis os.environ ou fallback http://localhost:11434.
    """
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = OllamaClient()
    return _ollama_client
