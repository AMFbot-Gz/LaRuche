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

// Ports lus depuis l'environnement (source unique : .env) avec fallbacks
const PORTS = {
  ORCHESTRATION: parseInt(process.env.AGENT_ORCHESTRATION_PORT) || 8001,
  PERCEPTION:    parseInt(process.env.AGENT_PERCEPTION_PORT)    || 8002,
  BRAIN:         parseInt(process.env.AGENT_BRAIN_PORT)         || 8003,
  EXECUTOR:      parseInt(process.env.AGENT_EXECUTOR_PORT)      || 8004,
  EVOLUTION:     parseInt(process.env.AGENT_EVOLUTION_PORT)     || 8005,
  MEMORY:        parseInt(process.env.AGENT_MEMORY_PORT)        || 8006,
  MCP_BRIDGE:    parseInt(process.env.AGENT_MCP_BRIDGE_PORT)    || 8007,
  DISCOVERY:     parseInt(process.env.AGENT_DISCOVERY_PORT)     || 8008,
  KNOWLEDGE:     parseInt(process.env.AGENT_KNOWLEDGE_PORT)     || 8009,
};

export const SERVICES = {
  QUEEN_PYTHON: `QueenPython:${PORTS.ORCHESTRATION}`,
  PERCEPTION:   `Perception:${PORTS.PERCEPTION}`,
  BRAIN:        `Brain:${PORTS.BRAIN}`,
  EXECUTOR:     `Executor:${PORTS.EXECUTOR}`,
  EVOLUTION:    `Evolution:${PORTS.EVOLUTION}`,
  MEMORY:       `Memory:${PORTS.MEMORY}`,
  MCP_BRIDGE:   `McpBridge:${PORTS.MCP_BRIDGE}`,
  DISCOVERY:    `Discovery:${PORTS.DISCOVERY}`,
  KNOWLEDGE:    `Knowledge:${PORTS.KNOWLEDGE}`,
};

// Config par service (timeouts adaptés à la charge de chaque agent)
const SERVICE_CONFIG = {
  [SERVICES.QUEEN_PYTHON]: { baseUrl: `http://localhost:${PORTS.ORCHESTRATION}`, callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.PERCEPTION]:   { baseUrl: `http://localhost:${PORTS.PERCEPTION}`,    callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.BRAIN]:        { baseUrl: `http://localhost:${PORTS.BRAIN}`,         callTimeoutMs: 60_000, failureThreshold: 3, resetTimeoutMs: 60_000 },
  [SERVICES.EXECUTOR]:     { baseUrl: `http://localhost:${PORTS.EXECUTOR}`,      callTimeoutMs: 10_000, failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.EVOLUTION]:    { baseUrl: `http://localhost:${PORTS.EVOLUTION}`,     callTimeoutMs: 10_000, failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.MEMORY]:       { baseUrl: `http://localhost:${PORTS.MEMORY}`,        callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.MCP_BRIDGE]:   { baseUrl: `http://localhost:${PORTS.MCP_BRIDGE}`,    callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.DISCOVERY]:    { baseUrl: `http://localhost:${PORTS.DISCOVERY}`,     callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
  [SERVICES.KNOWLEDGE]:    { baseUrl: `http://localhost:${PORTS.KNOWLEDGE}`,     callTimeoutMs: 5_000,  failureThreshold: 3, resetTimeoutMs: 30_000 },
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
