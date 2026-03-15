/**
 * hooks/useChimeraSocket.ts — Connexion WebSocket temps réel vers Queen Chimera
 *
 * - Se connecte à ws://localhost:9002 (NEXT_PUBLIC_DASHBOARD_WS_URL pour override)
 * - Reconnexion automatique toutes les 3s en cas de déconnexion
 * - Dispatche les événements reçus dans le store Zustand (useChimeraStore)
 * - Expose sendCommand() pour envoyer des commandes à la Queen
 *
 * Usage :
 *   const { sendCommand } = useChimeraSocket()
 *   sendCommand('run_mission', { command: 'Analyse les logs' })
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useChimeraStore } from '../store/chimera';

const WS_URL         = process.env.NEXT_PUBLIC_DASHBOARD_WS_URL ?? 'ws://localhost:9002';
const RECONNECT_DELAY = 3_000;

// ─── Types d'événements entrants ──────────────────────────────────────────────

interface WsEvent {
  type:       string;
  ts?:        number;
  events?:    WsEvent[];   // batch
  name?:      string;      // layer.down/up
  failures?:  number;
  missionId?: string;
  command?:   string;
  error?:     string;
  [key: string]: unknown;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChimeraSocket() {
  const wsRef    = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { setConnected, pushLog, setAgentStatus, setActiveMission } = useChimeraStore();

  // ── Dispatcher d'événements ─────────────────────────────────────────────────
  const handleEvent = useCallback((msg: WsEvent) => {
    // Batch → dépiler récursivement
    if (msg.type === 'batch' && Array.isArray(msg.events)) {
      msg.events.forEach(handleEvent);
      return;
    }

    // Log systématique (tronqué)
    pushLog({ type: msg.type, message: formatLog(msg), ts: msg.ts ?? Date.now() });

    switch (msg.type) {
      // Couches Python
      case 'layer.down':
        if (msg.name) setAgentStatus(msg.name, { status: 'down', failures: msg.failures ?? 1, lastSeen: Date.now() });
        break;
      case 'layer.up':
        if (msg.name) setAgentStatus(msg.name, { status: 'healthy', failures: 0, lastSeen: Date.now() });
        break;
      case 'health.agent':
        if (msg.name) setAgentStatus(msg.name, {
          status:   msg.status as any ?? 'healthy',
          lastSeen: Date.now(),
          failures: (msg.failures as number) ?? 0,
        });
        break;

      // Missions
      case 'mission_start':
      case 'mission_accepted':
        if (msg.missionId) setActiveMission({ id: msg.missionId, command: String(msg.command ?? ''), startTs: Date.now() });
        break;
      case 'mission_complete':
      case 'mission_error':
        setActiveMission(null);
        break;
    }
  }, [pushLog, setAgentStatus, setActiveMission]);

  // ── Connexion / reconnexion ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        pushLog({ type: 'system', message: `Connecté à la Reine (${WS_URL})`, ts: Date.now() });
      };

      ws.onmessage = (ev) => {
        try {
          handleEvent(JSON.parse(ev.data as string));
        } catch { /* message malformé — ignoré */ }
      };

      ws.onclose = () => {
        setConnected(false);
        pushLog({ type: 'system', message: 'Connexion perdue — reconnexion dans 3s…', ts: Date.now() });
        if (!cancelled) {
          timerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [handleEvent, setConnected, pushLog]);

  // ── API publique ─────────────────────────────────────────────────────────────
  const sendCommand = useCallback((type: string, data?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  return { sendCommand };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLog(msg: WsEvent): string {
  const { type, ts, ...rest } = msg;
  const parts: string[] = [];
  if (rest.command)   parts.push(String(rest.command).slice(0, 60));
  if (rest.missionId) parts.push(`#${String(rest.missionId).slice(-8)}`);
  if (rest.name)      parts.push(String(rest.name));
  if (rest.error)     parts.push(`⚠ ${String(rest.error).slice(0, 80)}`);
  return parts.length ? parts.join(' · ') : type;
}
