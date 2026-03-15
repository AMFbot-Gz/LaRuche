/**
 * utils/resilientFetch.js — fetch() avec Circuit Breaker intégré
 *
 * Drop-in pour remplacer les appels `fetch()` vers les services internes.
 * Chaque service (identifié par son nom) a son propre circuit breaker.
 *
 * Usage :
 *   import { resilientFetch, SERVICES } from '../utils/resilientFetch.js';
 *
 *   // Appel simple
 *   const res = await resilientFetch(SERVICES.BRAIN, '/raw', { method: 'POST', body: '...' });
 *
 *   // Fallback en cas de circuit ouvert
 *   try {
 *     const res = await resilientFetch(SERVICES.MEMORY, '/episode', opts);
 *   } catch (err) {
 *     if (err.name === 'CircuitOpenError') {
 *       // Dégradation gracieuse — ne pas crasher
 *     }
 *   }
 */

import { circuitRegistry, CircuitOpenError } from './circuitBreaker.js';

// ─── Registre des services internes ──────────────────────────────────────────

export const SERVICES = {
  QUEEN_PYTHON: 'QueenPython:8001',
  PERCEPTION:   'Perception:8002',
  BRAIN:        'Brain:8003',
  EXECUTOR:     'Executor:8004',
  EVOLUTION:    'Evolution:8005',
  MEMORY:       'Memory:8006',
  MCP_BRIDGE:   'McpBridge:8007',
};

// Config par service (timeouts adaptés à la charge de chaque agent)
const SERVICE_CONFIG = {
  [SERVICES.QUEEN_PYTHON]: { baseUrl: 'http://localhost:8001', callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.PERCEPTION]:   { baseUrl: 'http://localhost:8002', callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.BRAIN]:        { baseUrl: 'http://localhost:8003', callTimeoutMs: 60_000, failureThreshold: 3, resetTimeoutMs: 60_000 },
  [SERVICES.EXECUTOR]:     { baseUrl: 'http://localhost:8004', callTimeoutMs: 10_000, failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.EVOLUTION]:    { baseUrl: 'http://localhost:8005', callTimeoutMs: 10_000, failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.MEMORY]:       { baseUrl: 'http://localhost:8006', callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.MCP_BRIDGE]:   { baseUrl: 'http://localhost:8007', callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
};

// ─── Fonction principale ───────────────────────────────────────────────────────

/**
 * Effectue un fetch() protégé par circuit breaker.
 *
 * @param {string} service    — Nom du service (ex: SERVICES.BRAIN)
 * @param {string} path       — Chemin de l'endpoint (ex: '/raw')
 * @param {RequestInit} [opts] — Options fetch standard
 * @returns {Promise<Response>}
 * @throws {CircuitOpenError} si le circuit est ouvert
 * @throws {Error} si la requête échoue
 */
export async function resilientFetch(service, path, opts = {}) {
  const config = SERVICE_CONFIG[service];
  if (!config) {
    throw new Error(`Service inconnu: "${service}". Utilisez SERVICES.XXX`);
  }

  const cb = circuitRegistry.get(service, config);
  const url = `${config.baseUrl}${path}`;

  return cb.call(async () => {
    // AbortSignal pour le timeout par appel
    const signal = opts.signal ?? AbortSignal.timeout(config.callTimeoutMs);

    const res = await fetch(url, { ...opts, signal });

    // On considère les 5xx comme des erreurs de circuit (service dégradé)
    if (res.status >= 500) {
      throw new Error(`HTTP ${res.status} depuis ${service}${path}`);
    }

    return res;
  });
}

/**
 * Version fire-and-forget avec dégradation silencieuse.
 * Idéale pour les writes non-critiques (ex: sync mémoire épisodique).
 *
 * @param {string} service
 * @param {string} path
 * @param {RequestInit} [opts]
 * @param {string} [label]   — Label pour le log d'avertissement
 */
export function resilientFireAndForget(service, path, opts = {}, label = '') {
  resilientFetch(service, path, opts).catch((err) => {
    if (err.name === 'CircuitOpenError') {
      // Silencieux — le circuit est déjà ouvert, inutile de logger en boucle
      return;
    }
    console.warn(`[ResilientFetch] ⚠️  ${label || service + path} non-critique ignoré:`, err.message);
  });
}

// ─── Export de l'état des circuits (pour API /status) ────────────────────────

export { circuitRegistry, CircuitOpenError };
