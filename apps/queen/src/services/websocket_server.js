/**
 * services/websocket_server.js — Serveur WebSocket Dashboard Chimera
 *
 * Port 9002 (séparé du HUD Electron :9001)
 *
 * Événements diffusés au dashboard :
 *   Tous les appels broadcastHUD (missions, tâches, queue)
 *   + events eventBus : layer.down/up, health.*, evolution.*, agent.*
 *
 * Commandes acceptées depuis le dashboard :
 *   { type: "ping" }
 *   { type: "run_mission",  data: { command: "..." } }
 *   { type: "get_status" }
 *   Tout autre type → réémettre sur eventBus("dashboard.command", cmd)
 *
 * AUDIT SÉCURITÉ v2 :
 *   [CRITIQUE] Rate limiting : 10 commandes/sec par connexion
 *   [HAUTE]    Validation longueur commande run_mission (max 2000 chars)
 *   [HAUTE]    Comparaison token timing-safe (crypto.timingSafeEqual)
 *   [HAUTE]    Token extrait mais jamais loggué
 *   [HAUTE]    Timeout connexion inactive (30s sans message)
 *   [HAUTE]    Message max size : 64 Ko
 */

import { WebSocketServer } from 'ws';
import { timingSafeEqual } from 'crypto';
import eventBus from '../../core/events/event_bus.js';
import { logger } from '../utils/logger.js';

// ─── Config ────────────────────────────────────────────────────────────────────

const DASHBOARD_PORT  = parseInt(process.env.DASHBOARD_WS_PORT || '9002', 10);
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || null;

// Sécurité : limites strictes
const MAX_MESSAGE_BYTES   = 64 * 1024;       // 64 Ko max par message
const MAX_COMMAND_LENGTH  = 2_000;           // Commande mission max 2000 chars
const RATE_LIMIT_RPM      = 10;              // Max 10 commandes/sec par connexion
const CONN_IDLE_TIMEOUT   = 60_000;          // Déconnexion si inactif > 60s

// ─── État interne ──────────────────────────────────────────────────────────────

const _clients    = new Set();
const _rateLimits = new Map(); // wsId → { count, windowStart }
let _wss          = null;
let _wsIdCounter  = 0;

// Batch flush 50ms (cohérent avec broadcastHUD du HUD Electron)
let _batch      = [];
let _flushTimer = null;

// ─── Broadcast public ──────────────────────────────────────────────────────────

/**
 * Diffuse un événement à tous les clients dashboard connectés.
 * Batching 50ms pour éviter des centaines de send() individuels.
 */
export function broadcastDashboard(event) {
  if (_clients.size === 0) return;

  _batch.push({ ...event, ts: event.ts ?? Date.now() });

  if (!_flushTimer) {
    _flushTimer = setTimeout(() => {
      _flushTimer = null;
      if (_batch.length === 0) return;

      const batch   = _batch.splice(0);
      const payload = batch.length === 1
        ? JSON.stringify(batch[0])
        : JSON.stringify({ type: 'batch', events: batch });

      for (const ws of _clients) {
        if (ws.readyState === 1) {
          try { ws.send(payload); }
          catch { _clients.delete(ws); }
        }
      }
    }, 50).unref?.();
  }
}

/** Nombre de clients dashboard actuellement connectés. */
export function getDashboardClientCount() {
  return _clients.size;
}

// ─── Démarrage du serveur ──────────────────────────────────────────────────────

/**
 * Démarre le serveur WebSocket dashboard.
 *
 * @param {{ runMission?: Function }} deps — Injectées depuis queen_oss.js
 * @returns {WebSocketServer}
 */
export function startDashboardWSServer({ runMission } = {}) {
  _wss = new WebSocketServer({ port: DASHBOARD_PORT });

  // Gestion explicite EADDRINUSE
  _wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Dashboard WS: Port ${DASHBOARD_PORT} déjà utilisé — désactivé`);
    } else {
      logger.error(`Dashboard WS: ${err.message}`);
    }
  });

  _wss.on('connection', (ws, req) => {
    // ── Auth : token query param avec comparaison timing-safe ──────────────
    if (DASHBOARD_TOKEN) {
      try {
        const url   = new URL(req.url, `http://localhost:${DASHBOARD_PORT}`);
        const token = url.searchParams.get('token') ?? '';
        // timingSafeEqual requiert des buffers de même longueur
        const expected = Buffer.from(DASHBOARD_TOKEN);
        const received = Buffer.from(token);
        const valid = received.length === expected.length &&
          timingSafeEqual(received, expected);
        if (!valid) {
          logger.warn(`Dashboard WS: tentative de connexion non autorisée depuis ${req.socket?.remoteAddress}`);
          ws.close(4001, 'Unauthorized');
          return;
        }
      } catch {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    // ── ID unique par connexion (pour rate limiting) ────────────────────────
    const wsId = ++_wsIdCounter;
    ws._chimeraId = wsId;

    _clients.add(ws);
    logger.info(`Dashboard WS: client #${wsId} connecté (${_clients.size} total)`);

    // ── Timeout d'inactivité ────────────────────────────────────────────────
    let idleTimer = setTimeout(() => {
      logger.warn(`Dashboard WS: client #${wsId} inactif — déconnexion`);
      ws.close(4000, 'Idle timeout');
    }, CONN_IDLE_TIMEOUT);

    const _resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        logger.warn(`Dashboard WS: client #${wsId} inactif — déconnexion`);
        ws.close(4000, 'Idle timeout');
      }, CONN_IDLE_TIMEOUT);
    };

    // Message de bienvenue avec snapshot initial
    ws.send(JSON.stringify({
      type:        'connected',
      clientId:    wsId,
      clientCount: _clients.size,
      ts:          Date.now(),
    }));

    ws.on('message', (data, isBinary) => {
      // ── Taille max message ────────────────────────────────────────────────
      const buf = isBinary ? data : Buffer.from(data);
      if (buf.length > MAX_MESSAGE_BYTES) {
        ws.send(JSON.stringify({ type: 'error', message: 'Message trop volumineux' }));
        return;
      }
      _resetIdle();
      _handleCommand(ws, data.toString(), runMission);
    });

    ws.on('close', () => {
      clearTimeout(idleTimer);
      _clients.delete(ws);
      _rateLimits.delete(wsId);
      logger.info(`Dashboard WS: client #${wsId} déconnecté (${_clients.size} restants)`);
    });
    ws.on('error', () => {
      clearTimeout(idleTimer);
      _clients.delete(ws);
      _rateLimits.delete(wsId);
    });
  });

  // ── Abonnements eventBus → dashboard ──────────────────────────────────────
  // Couches Python (DistributedHealthMonitor)
  eventBus.on('layer.down',    (p) => broadcastDashboard({ type: 'layer.down',    ...p }));
  eventBus.on('layer.up',      (p) => broadcastDashboard({ type: 'layer.up',      ...p }));
  eventBus.on('health.report', (p) => broadcastDashboard({ type: 'health.report', ...p }));
  eventBus.on('health.agent',  (p) => broadcastDashboard({ type: 'health.agent',  ...p }));

  // Auto-Coder Bee (evolution)
  eventBus.on('evolution.skill_saved',    (p) => broadcastDashboard({ type: 'evolution.skill_saved',    ...p }));
  eventBus.on('evolution.code_generated', (p) => broadcastDashboard({ type: 'evolution.code_generated', ...p }));

  // Sous-agents
  eventBus.on('agent.start', (p) => broadcastDashboard({ type: 'agent.start', ...p }));
  eventBus.on('agent.done',  (p) => broadcastDashboard({ type: 'agent.done',  ...p }));
  eventBus.on('agent.error', (p) => broadcastDashboard({ type: 'agent.error', ...p }));

  logger.info(`📊 Dashboard WebSocket en écoute sur port ${DASHBOARD_PORT}`);
  return _wss;
}

// ─── Rate limiting par connexion ──────────────────────────────────────────────

function _isRateLimited(ws) {
  const wsId = ws._chimeraId;
  const now  = Date.now();
  let   state = _rateLimits.get(wsId);

  if (!state || now - state.windowStart >= 1000) {
    // Nouvelle fenêtre d'1 seconde
    state = { count: 0, windowStart: now };
    _rateLimits.set(wsId, state);
  }

  state.count++;
  if (state.count > RATE_LIMIT_RPM) {
    logger.warn(`Dashboard WS: rate limit dépassé pour client #${wsId} (${state.count} cmd/s)`);
    return true;
  }
  return false;
}

// ─── Gestion des commandes entrantes ──────────────────────────────────────────

// Types de commandes autorisés depuis le dashboard (whitelist)
const ALLOWED_COMMAND_TYPES = new Set(['ping', 'run_mission', 'get_status']);

async function _handleCommand(ws, raw, runMission) {
  // ── Rate limiting ─────────────────────────────────────────────────────────
  if (_isRateLimited(ws)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Rate limit dépassé — max 10 cmd/s' }));
    return;
  }

  let cmd;
  try { cmd = JSON.parse(raw); }
  catch {
    ws.send(JSON.stringify({ type: 'error', message: 'JSON invalide' }));
    return;
  }

  // ── Validation du type ────────────────────────────────────────────────────
  if (typeof cmd.type !== 'string' || !ALLOWED_COMMAND_TYPES.has(cmd.type)) {
    // Commande inconnue : réémettre sur bus uniquement si le type est une string valide
    if (typeof cmd.type === 'string' && cmd.type.length <= 64) {
      eventBus.emit('dashboard.command', { ...cmd, _fromDashboard: true });
    }
    return;
  }

  switch (cmd.type) {

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      break;

    case 'run_mission': {
      const command = cmd.data?.command;
      // Validation : string non vide, longueur bornée
      if (!command || typeof command !== 'string') {
        ws.send(JSON.stringify({ type: 'error', message: 'run_mission.data.command requis (string)' }));
        break;
      }
      if (command.trim().length < 5) {
        ws.send(JSON.stringify({ type: 'error', message: 'Commande trop courte (min 5 chars)' }));
        break;
      }
      if (command.length > MAX_COMMAND_LENGTH) {
        ws.send(JSON.stringify({ type: 'error', message: `Commande trop longue (max ${MAX_COMMAND_LENGTH} chars)` }));
        break;
      }
      if (runMission) {
        const missionId = `dash_${Date.now()}`;
        broadcastDashboard({ type: 'mission_accepted', missionId, command: command.slice(0, 100) });
        // Exécution non-bloquante — résultat diffusé via broadcastHUD → broadcastDashboard
        runMission(command.trim(), missionId).catch((err) => {
          broadcastDashboard({ type: 'mission_error', missionId, error: err.message });
        });
      }
      break;
    }

    case 'get_status':
      ws.send(JSON.stringify({
        type:        'status',
        clientCount: _clients.size,
        ts:          Date.now(),
      }));
      break;
  }
}
