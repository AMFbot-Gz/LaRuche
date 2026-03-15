/**
 * store/chimera.ts — État global Chimera (Zustand)
 *
 * Stores :
 *   - Statut de connexion WebSocket
 *   - États des couches Python (7 agents)
 *   - Log des événements temps réel (50 entrées max)
 *   - Mission active
 */

import { create } from 'zustand';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AgentStatus = 'healthy' | 'down' | 'degraded' | 'unknown';

export interface AgentState {
  name:     string;
  status:   AgentStatus;
  port:     number;
  failures: number;
  lastSeen: number;
}

export interface LogEntry {
  id:      string;
  type:    string;
  message: string;
  ts:      number;
}

export interface ActiveMission {
  id:      string;
  command: string;
  startTs: number;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

interface ChimeraStore {
  // Connexion
  connected:     boolean;
  setConnected:  (v: boolean) => void;

  // Agents (7 couches Python + queen)
  agents:         Record<string, AgentState>;
  setAgentStatus: (name: string, update: Partial<AgentState>) => void;
  initAgents:     () => void;

  // Logs temps réel
  logs:     LogEntry[];
  pushLog:  (entry: Omit<LogEntry, 'id'>) => void;
  clearLogs: () => void;

  // Mission active
  activeMission:    ActiveMission | null;
  setActiveMission: (m: ActiveMission | null) => void;
}

const MAX_LOGS = 50;

// Lit un port depuis process.env (Next.js expose les vars NEXT_PUBLIC_ au client)
const getAgentPort = (envVar: string, fallback: number): number => {
  if (typeof process !== 'undefined' && process.env[envVar]) {
    return parseInt(process.env[envVar]!, 10);
  }
  return fallback;
};

// Agents attendus dans le cluster Chimera — ports lus depuis .env (source unique)
const DEFAULT_AGENTS: AgentState[] = [
  { name: 'orchestration', port: getAgentPort('NEXT_PUBLIC_AGENT_ORCHESTRATION_PORT', 8001), status: 'unknown', failures: 0, lastSeen: 0 },
  { name: 'perception',    port: getAgentPort('NEXT_PUBLIC_AGENT_PERCEPTION_PORT',    8002), status: 'unknown', failures: 0, lastSeen: 0 },
  { name: 'brain',         port: getAgentPort('NEXT_PUBLIC_AGENT_BRAIN_PORT',         8003), status: 'unknown', failures: 0, lastSeen: 0 },
  { name: 'executor',      port: getAgentPort('NEXT_PUBLIC_AGENT_EXECUTOR_PORT',      8004), status: 'unknown', failures: 0, lastSeen: 0 },
  { name: 'evolution',     port: getAgentPort('NEXT_PUBLIC_AGENT_EVOLUTION_PORT',     8005), status: 'unknown', failures: 0, lastSeen: 0 },
  { name: 'memory',        port: getAgentPort('NEXT_PUBLIC_AGENT_MEMORY_PORT',        8006), status: 'unknown', failures: 0, lastSeen: 0 },
  { name: 'mcp-bridge',    port: getAgentPort('NEXT_PUBLIC_AGENT_MCP_BRIDGE_PORT',    8007), status: 'unknown', failures: 0, lastSeen: 0 },
  { name: 'discovery',     port: getAgentPort('NEXT_PUBLIC_AGENT_DISCOVERY_PORT',     8008), status: 'unknown', failures: 0, lastSeen: 0 },
  { name: 'knowledge',     port: getAgentPort('NEXT_PUBLIC_AGENT_KNOWLEDGE_PORT',     8009), status: 'unknown', failures: 0, lastSeen: 0 },
];

export const useChimeraStore = create<ChimeraStore>((set) => ({
  // ── Connexion ──────────────────────────────────────────────────────────────
  connected:    false,
  setConnected: (v) => set({ connected: v }),

  // ── Agents ─────────────────────────────────────────────────────────────────
  agents: Object.fromEntries(DEFAULT_AGENTS.map((a) => [a.name, a])),

  setAgentStatus: (name, update) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [name]: { ...(state.agents[name] ?? { name, port: 0, status: 'unknown', failures: 0, lastSeen: 0 }), ...update },
      },
    })),

  initAgents: () =>
    set({ agents: Object.fromEntries(DEFAULT_AGENTS.map((a) => [a.name, a])) }),

  // ── Logs ───────────────────────────────────────────────────────────────────
  logs: [],

  pushLog: (entry) =>
    set((state) => ({
      logs: [
        { ...entry, id: `${entry.ts}_${Math.random().toString(36).slice(2, 7)}` },
        ...state.logs,
      ].slice(0, MAX_LOGS),
    })),

  clearLogs: () => set({ logs: [] }),

  // ── Mission active ─────────────────────────────────────────────────────────
  activeMission:    null,
  setActiveMission: (m) => set({ activeMission: m }),
}));
