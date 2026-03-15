/**
 * utils/circuitBreaker.js — Circuit Breaker pattern pour Chimera
 *
 * Protège les appels inter-services contre les cascades d'échecs.
 * Trois états :
 *   CLOSED    — Normal. Appels passent, échecs comptabilisés.
 *   OPEN      — Circuit ouvert. Tous les appels échouent instantanément.
 *   HALF_OPEN — Probe en cours. Un seul appel test autorisé.
 *
 * Intégration avec DistributedHealthMonitor : l'état OPEN d'un circuit est
 * remonté comme événement 'circuit.open' sur le bus d'événements.
 */

// ─── États du circuit ─────────────────────────────────────────────────────────
export const CircuitState = {
  CLOSED:    'CLOSED',
  OPEN:      'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

// ─── Erreur spécifique circuit ouvert ─────────────────────────────────────────
export class CircuitOpenError extends Error {
  constructor(serviceName, openSinceMs) {
    super(`Circuit OPEN pour "${serviceName}" (ouvert depuis ${openSinceMs}ms) — appel rejeté`);
    this.name = 'CircuitOpenError';
    this.serviceName = serviceName;
    this.openSinceMs = openSinceMs;
  }
}

// ─── CircuitBreaker ───────────────────────────────────────────────────────────

export class CircuitBreaker {
  /**
   * @param {string} name         — Nom du service protégé (ex: "Brain:8003")
   * @param {object} [opts]
   * @param {number} [opts.failureThreshold=3]   — Nb d'échecs pour ouvrir le circuit
   * @param {number} [opts.successThreshold=2]   — Nb de succès pour refermer depuis HALF_OPEN
   * @param {number} [opts.resetTimeoutMs=30000] — Délai avant de tenter HALF_OPEN
   * @param {number} [opts.callTimeoutMs=5000]   — Timeout par appel (si fn ne gère pas)
   * @param {object} [opts.eventBus]             — Bus d'événements pour notifications
   */
  constructor(name, opts = {}) {
    this.name             = name;
    this.failureThreshold = opts.failureThreshold  ?? 3;
    this.successThreshold = opts.successThreshold  ?? 2;
    this.resetTimeoutMs   = opts.resetTimeoutMs    ?? 30_000;
    this.callTimeoutMs    = opts.callTimeoutMs      ?? 5_000;
    this.eventBus         = opts.eventBus           ?? null;

    // État interne
    this._state          = CircuitState.CLOSED;
    this._failures       = 0;
    this._successes      = 0;  // compteur pour HALF_OPEN
    this._openSince      = null;
    this._lastError      = null;
    this._totalCalls     = 0;
    this._totalRejected  = 0;
    this._totalSuccess   = 0;
    this._totalFailure   = 0;
  }

  // ─── API publique ─────────────────────────────────────────────────────────────

  /**
   * Exécute fn() avec protection circuit breaker.
   * @template T
   * @param {() => Promise<T>} fn — Fonction async à protéger
   * @returns {Promise<T>}
   * @throws {CircuitOpenError} si le circuit est ouvert
   * @throws {Error}            si fn() échoue (propagé)
   */
  async call(fn) {
    this._totalCalls++;

    switch (this._state) {
      case CircuitState.OPEN:
        // Vérifier si on peut passer en HALF_OPEN
        if (Date.now() - this._openSince >= this.resetTimeoutMs) {
          this._toHalfOpen();
        } else {
          this._totalRejected++;
          throw new CircuitOpenError(this.name, Date.now() - this._openSince);
        }
        break;

      case CircuitState.HALF_OPEN:
        // Autoriser seulement si aucun probe en cours — sinon rejeter
        // (évite multiple probes simultanés)
        if (this._probeInProgress) {
          this._totalRejected++;
          throw new CircuitOpenError(this.name, Date.now() - this._openSince);
        }
        this._probeInProgress = true;
        break;

      // CLOSED : on passe directement
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    } finally {
      if (this._state === CircuitState.HALF_OPEN) {
        this._probeInProgress = false;
      }
    }
  }

  /** État courant du circuit */
  getState() {
    return {
      state:         this._state,
      failures:      this._failures,
      openSince:     this._openSince,
      lastError:     this._lastError?.message ?? null,
      stats: {
        total:    this._totalCalls,
        success:  this._totalSuccess,
        failure:  this._totalFailure,
        rejected: this._totalRejected,
      },
    };
  }

  /** Force la fermeture du circuit (ex: après un reset manuel) */
  reset() {
    this._toClosed();
  }

  // ─── Transitions d'état ───────────────────────────────────────────────────────

  _onSuccess() {
    this._totalSuccess++;
    this._lastError = null;

    if (this._state === CircuitState.HALF_OPEN) {
      this._successes++;
      if (this._successes >= this.successThreshold) {
        this._toClosed();
      }
    } else {
      // CLOSED : reset le compteur d'échecs
      this._failures = 0;
    }
  }

  _onFailure(err) {
    this._totalFailure++;
    this._failures++;
    this._lastError = err;

    if (this._state === CircuitState.HALF_OPEN) {
      // Probe échoué → reouvrir
      this._toOpen(`Probe HALF_OPEN échoué: ${err.message}`);
    } else if (this._failures >= this.failureThreshold) {
      // Seuil atteint → ouvrir
      this._toOpen(`Seuil de ${this.failureThreshold} échecs atteint: ${err.message}`);
    }
  }

  _toOpen(reason) {
    const wasAlreadyOpen = this._state === CircuitState.OPEN;
    this._state    = CircuitState.OPEN;
    this._openSince = wasAlreadyOpen ? this._openSince : Date.now();
    this._successes = 0;

    if (!wasAlreadyOpen) {
      console.warn(`[CircuitBreaker] 🔴 OPEN "${this.name}" — ${reason}`);
      this.eventBus?.emit?.('circuit.open', {
        service:  this.name,
        reason,
        failures: this._failures,
      });
    }
  }

  _toHalfOpen() {
    this._state          = CircuitState.HALF_OPEN;
    this._successes      = 0;
    this._probeInProgress = false;
    console.info(`[CircuitBreaker] 🟡 HALF_OPEN "${this.name}" — probe autorisé`);
    this.eventBus?.emit?.('circuit.half_open', { service: this.name });
  }

  _toClosed() {
    const wasOpen = this._state !== CircuitState.CLOSED;
    this._state    = CircuitState.CLOSED;
    this._failures  = 0;
    this._successes = 0;
    this._openSince = null;
    this._lastError = null;

    if (wasOpen) {
      console.info(`[CircuitBreaker] 🟢 CLOSED "${this.name}" — circuit rétabli`);
      this.eventBus?.emit?.('circuit.closed', { service: this.name });
    }
  }
}

// ─── Registry global des circuits ─────────────────────────────────────────────

/**
 * Registry singleton — un circuit par service.
 * Permet d'inspecter l'état de tous les circuits depuis n'importe où.
 */
class CircuitBreakerRegistry {
  constructor() {
    /** @type {Map<string, CircuitBreaker>} */
    this._breakers = new Map();
    this._eventBus  = null;
  }

  /** Injecte le bus d'événements (appelé au démarrage de la Queen) */
  setEventBus(bus) {
    this._eventBus = bus;
    // Propager à tous les breakers existants
    for (const cb of this._breakers.values()) {
      cb.eventBus = bus;
    }
  }

  /**
   * Obtient ou crée un circuit breaker pour un service.
   * @param {string} name
   * @param {object} [opts]
   * @returns {CircuitBreaker}
   */
  get(name, opts = {}) {
    if (!this._breakers.has(name)) {
      const cb = new CircuitBreaker(name, { ...opts, eventBus: this._eventBus });
      this._breakers.set(name, cb);
    }
    return this._breakers.get(name);
  }

  /**
   * État de tous les circuits (pour le dashboard / healthcheck).
   * @returns {Record<string, object>}
   */
  getAll() {
    const out = {};
    for (const [name, cb] of this._breakers) {
      out[name] = cb.getState();
    }
    return out;
  }

  /**
   * Reset un circuit spécifique.
   * @param {string} name
   */
  reset(name) {
    this._breakers.get(name)?.reset();
  }
}

export const circuitRegistry = new CircuitBreakerRegistry();
