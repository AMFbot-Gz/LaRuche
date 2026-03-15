/**
 * core/consciousness/neural_event_bus.js
 * Ghost OS Ultimate — Bus d'événements neuronal haute performance
 *
 * Extension de l'EventBus PICO-RUCHE avec :
 *   - Priorités d'écouteurs
 *   - Pipeline middleware
 *   - Métriques d'impulsions
 *   - Gestion d'erreurs par écouteur
 *
 * AUDIT SÉCURITÉ v2 :
 *   [CRITIQUE] Espaces de noms protégés (system.* requiert permission interne)
 *   [CRITIQUE] Validation du payload (type, taille max)
 *   [HAUTE]    Rate limiting global : 500 emit/s max
 *   [HAUTE]    getRecentEvents() filtré (ne retourne pas les payloads complets)
 *   [HAUTE]    Validation du nom d'événement (string, longueur bornée)
 */

// ─── Constantes de sécurité ───────────────────────────────────────────────────

// Préfixes d'événements protégés : seul le bus interne peut les émettre
// (via emit interne avec _trusted: true dans options)
const PROTECTED_NAMESPACES = ['system.', 'chimera.internal.'];

// Taille max d'un payload sérialisé (256 Ko)
const MAX_PAYLOAD_BYTES = 256 * 1024;

// Rate limiting global : max 500 emit/s (protège contre les boucles infinies)
const GLOBAL_RATE_LIMIT = 500;

export class NeuralEventBus {
  constructor() {
    // Map<event, [{listener, priority}]>
    this._listeners = new Map();
    this._middleware = [];
    this._metrics = {
      impulses:         0,
      total_latency_ms: 0,
      errors:           0,
      rejected:         0,
    };
    // Historique : stocke uniquement event + timestamp (pas le payload complet)
    this._history    = [];
    this._MAX_HISTORY = 100;

    // Rate limiting global
    this._rateWindow = { count: 0, windowStart: Date.now() };
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  _validateEvent(event) {
    if (typeof event !== 'string' || event.length === 0 || event.length > 128) {
      throw new Error(`[NeuralEventBus] Nom d'événement invalide : "${event}"`);
    }
  }

  _validatePayload(payload) {
    if (payload === null || payload === undefined) return {};
    if (typeof payload !== 'object' || Array.isArray(payload)) {
      throw new TypeError(`[NeuralEventBus] Payload doit être un objet, reçu : ${typeof payload}`);
    }
    // Vérifie la taille sérialisée
    try {
      const size = Buffer.byteLength(JSON.stringify(payload));
      if (size > MAX_PAYLOAD_BYTES) {
        throw new Error(`[NeuralEventBus] Payload trop volumineux : ${size} bytes > ${MAX_PAYLOAD_BYTES}`);
      }
    } catch (e) {
      if (e.message.includes('volumineux')) throw e;
      // Payload non-sérialisable : autorisé mais on ne peut pas vérifier la taille
    }
    return payload;
  }

  _checkRateLimit() {
    const now = Date.now();
    if (now - this._rateWindow.windowStart >= 1000) {
      this._rateWindow = { count: 0, windowStart: now };
    }
    this._rateWindow.count++;
    return this._rateWindow.count <= GLOBAL_RATE_LIMIT;
  }

  // ─── API principale ───────────────────────────────────────────────────────

  /**
   * Émet un événement vers tous les écouteurs en parallèle.
   * @param {string} event
   * @param {object} payload
   * @param {{ _trusted?: boolean }} options  — _trusted: true pour les espaces protégés
   */
  async emit(event, payload = {}, options = {}) {
    // ── Validation ────────────────────────────────────────────────────────
    this._validateEvent(event);

    // Espaces de noms protégés (system.*, chimera.internal.*)
    if (!options._trusted) {
      for (const ns of PROTECTED_NAMESPACES) {
        if (event.startsWith(ns)) {
          this._metrics.rejected++;
          console.warn(`[NeuralEventBus] Émission refusée sur namespace protégé "${event}"`);
          return;
        }
      }
    }

    // Rate limiting global
    if (!this._checkRateLimit()) {
      this._metrics.rejected++;
      console.warn(`[NeuralEventBus] Rate limit global dépassé — ${event} ignoré`);
      return;
    }

    const start = performance.now();
    this._metrics.impulses++;

    // Validation du payload
    let validated;
    try {
      validated = this._validatePayload(payload);
    } catch (err) {
      this._metrics.errors++;
      console.error(`[NeuralEventBus] Payload invalide sur "${event}":`, err.message);
      return;
    }

    // Pipeline middleware (logging, tracing, auth…)
    let processed = validated;
    for (const mw of this._middleware) {
      try {
        const result = await mw(processed, event, options);
        // Middleware doit retourner un objet valide ou null (conserve processed)
        if (result !== null && result !== undefined) {
          processed = result;
        }
      } catch (err) {
        console.error(`[NeuralEventBus] Middleware error on "${event}":`, err.message);
        // Middleware en erreur : on continue avec le payload précédent
      }
    }

    // Distribution parallèle avec allSettled (visibilité complète des erreurs)
    const entries = this._listeners.get(event) || [];
    const results = await Promise.allSettled(
      entries.map(({ listener }) =>
        Promise.resolve().then(() => listener(processed))
      )
    );

    // Log des listeners en erreur
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this._metrics.errors++;
        console.error(`[NeuralEventBus] Listener[${i}] error on "${event}":`, r.reason?.message);
      }
    });

    // Métriques
    const latency = performance.now() - start;
    this._metrics.total_latency_ms += latency;

    // Historique : event + timestamp UNIQUEMENT (pas le payload — évite fuite de données)
    this._history.push({ event, timestamp: Date.now(), latency_ms: Math.round(latency * 10) / 10 });
    if (this._history.length > this._MAX_HISTORY) this._history.shift();
  }

  /**
   * Émet un événement de système (namespace protégé).
   * Réservé à l'usage interne (queen_oss, DistributedHealthMonitor…).
   */
  async emitInternal(event, payload = {}) {
    return this.emit(event, payload, { _trusted: true });
  }

  /**
   * Abonne un écouteur à un événement.
   * @param {string} event
   * @param {Function} listener
   * @param {number} priority - Plus élevé = appelé en premier (tri décroissant)
   */
  on(event, listener, priority = 0) {
    this._validateEvent(event);
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    const arr = this._listeners.get(event);
    arr.push({ listener, priority });
    arr.sort((a, b) => b.priority - a.priority);
    return () => this.off(event, listener);  // Retourne unsubscribe
  }

  /** Désabonne un écouteur. */
  off(event, listener) {
    if (!this._listeners.has(event)) return;
    const arr = this._listeners.get(event).filter(e => e.listener !== listener);
    this._listeners.set(event, arr);
  }

  /** Abonnement one-shot (auto-désabonnement après premier appel). */
  once(event, listener) {
    const wrapped = async (payload) => {
      this.off(event, wrapped);
      await listener(payload);
    };
    this.on(event, wrapped);
  }

  /** Ajoute un middleware au pipeline. */
  use(middleware) {
    this._middleware.push(middleware);
  }

  // ─── Métriques & debug ────────────────────────────────────────────────────

  getMetrics() {
    const avg_latency = this._metrics.impulses > 0
      ? this._metrics.total_latency_ms / this._metrics.impulses
      : 0;

    return {
      ...this._metrics,
      avg_latency_ms:    Math.round(avg_latency * 100) / 100,
      registered_events: this._listeners.size,
      total_listeners:   Array.from(this._listeners.values()).reduce((s, a) => s + a.length, 0),
    };
  }

  /**
   * Retourne l'historique récent sans les payloads (sécurité).
   * @param {number} n - Nombre d'événements max
   */
  getRecentEvents(n = 20) {
    // Ne retourne QUE event + timestamp (pas les payloads qui peuvent contenir des secrets)
    return this._history.slice(-Math.min(n, this._MAX_HISTORY));
  }

  listEvents() {
    return Array.from(this._listeners.keys());
  }

  reset() {
    this._listeners.clear();
    this._middleware.length = 0;
    this._metrics = { impulses: 0, total_latency_ms: 0, errors: 0, rejected: 0 };
    this._history.length = 0;
    this._rateWindow = { count: 0, windowStart: Date.now() };
  }
}
