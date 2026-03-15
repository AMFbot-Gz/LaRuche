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
 */

import { WebSocketServer } from 'ws';
import eventBus from '../../core/events/event_bus.js';
import { logger } from '../utils/logger.js';

// ─── Config ────────────────────────────────────────────────────────────────────

const DASHBOARD_PORT  = parseInt(process.env.DASHBOARD_WS_PORT || '9002', 10);
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || null;

// ─── État interne ──────────────────────────────────────────────────────────────

const _clients = new Set();
let _wss       = null;

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
    // Auth optionnelle via ?token=...
    if (DASHBOARD_TOKEN) {
      try {
        const url   = new URL(req.url, `http://localhost:${DASHBOARD_PORT}`);
        const token = url.searchParams.get('token');
        if (token !== DASHBOARD_TOKEN) { ws.close(4001, 'Unauthorized'); return; }
      } catch {
        ws.close(4001, 'Unauthorized');
        return;
      }
    }

    _clients.add(ws);
    logger.info(`Dashboard WS: client connecté (${_clients.size})`);

    // Message de bienvenue avec snapshot initial
    ws.send(JSON.stringify({
      type:        'connected',
      clientCount: _clients.size,
      ts:          Date.now(),
    }));

    ws.on('message', (data) => _handleCommand(ws, data.toString(), runMission));
    ws.on('close',   () => {
      _clients.delete(ws);
      logger.info(`Dashboard WS: client déconnecté (${_clients.size})`);
    });
    ws.on('error', () => _clients.delete(ws));
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

// ─── Gestion des commandes entrantes ──────────────────────────────────────────

async function _handleCommand(ws, raw, runMission) {
  let cmd;
  try { cmd = JSON.parse(raw); }
  catch { return; }

  switch (cmd.type) {

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      break;

    case 'run_mission':
      if (runMission && cmd.data?.command) {
        const missionId = `dash_${Date.now()}`;
        broadcastDashboard({ type: 'mission_accepted', missionId, command: cmd.data.command });
        // Exécution non-bloquante — le résultat sera diffusé via broadcastHUD/broadcastDashboard
        runMission(cmd.data.command, missionId).catch((err) => {
          broadcastDashboard({ type: 'mission_error', missionId, error: err.message });
        });
      }
      break;

    case 'get_status':
      ws.send(JSON.stringify({
        type:        'status',
        clientCount: _clients.size,
        ts:          Date.now(),
      }));
      break;

    default:
      // Réémet sur le bus pour que d'autres modules puissent réagir
      eventBus.emit('dashboard.command', cmd);
  }
}
