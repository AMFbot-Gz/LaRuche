'use client';

/**
 * app/agents/page.tsx — Tableau de bord détaillé des agents Chimera
 *
 * Affiche en temps réel le statut de chaque agent (Queen + 9 Python),
 * ses métriques de santé, et permet de déclencher des actions de maintenance.
 */

import React, { useState, useEffect } from 'react';
import { useChimeraSocket } from '../../../hooks/useChimeraSocket';
import { useChimeraStore, AgentState } from '../../../store/chimera';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentHealth {
  status:  string;
  version: string;
  uptime:  number;
  memory?: { used: number; total: number };
}

// ─── Config agents ────────────────────────────────────────────────────────────

const AGENT_META: Record<string, { icon: string; description: string; language: string; port: number }> = {
  queen:         { icon: '👑', description: 'Orchestrateur principal + API REST + WebSocket',    language: 'Node.js',  port: 3000 },
  orchestration: { icon: '🎯', description: 'ReAct planner · missions multi-étapes',             language: 'Python',   port: 8001 },
  perception:    { icon: '👁',  description: 'Vision Claude + analyse screenshot',                language: 'Python',   port: 8002 },
  brain:         { icon: '🧠', description: 'Raisonnement LLM · Claude claude-sonnet-4-6',                language: 'Python',   port: 8003 },
  executor:      { icon: '⚙️', description: 'Computer Use · click, type, key, open_app',         language: 'Python',   port: 8004 },
  evolution:     { icon: '🧬', description: 'Auto-Coder Bee · génération + sandbox AST',         language: 'Python',   port: 8005 },
  memory:        { icon: '💾', description: 'ChromaDB + fastembed · mémoire sémantique (RAG)',   language: 'Python',   port: 8006 },
  'mcp-bridge':  { icon: '🌉', description: 'Pont MCP · connecte les outils externes',           language: 'Node.js',  port: 8007 },
  voice:         { icon: '🎙', description: 'STT (faster-whisper) + TTS (piper / say)',           language: 'Python',   port: 8010 },
};

const QUEEN_URL = process.env.NEXT_PUBLIC_QUEEN_URL ?? 'http://localhost:3000';

// ─── Composant AgentCard ──────────────────────────────────────────────────────

function AgentCard({ agentKey, state }: { agentKey: string; state: AgentState }) {
  const meta    = AGENT_META[agentKey] ?? { icon: '🔧', description: agentKey, language: 'Python', port: state.port };
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [loading, setLoading] = useState(false);

  const statusColor: Record<string, string> = {
    healthy:  '#4ade80',
    down:     '#f87171',
    degraded: '#facc15',
    unknown:  '#6b7280',
  };

  const color = statusColor[state.status] ?? '#6b7280';

  async function checkHealth() {
    setLoading(true);
    try {
      const baseUrl = agentKey === 'queen' ? QUEEN_URL : `http://localhost:${meta.port}`;
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) setHealth(await res.json());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }

  // Ping automatique à l'affichage
  useEffect(() => { checkHealth(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const uptimeStr = health?.uptime != null
    ? health.uptime < 60
      ? `${Math.round(health.uptime)}s`
      : health.uptime < 3600
        ? `${Math.round(health.uptime / 60)}min`
        : `${(health.uptime / 3600).toFixed(1)}h`
    : null;

  return (
    <div style={{
      background:   '#1a1d27',
      border:       `1px solid ${color}20`,
      borderRadius: '12px',
      padding:      '18px',
      position:     'relative',
      overflow:     'hidden',
    }}>
      {/* Accent barre couleur statut */}
      <div style={{
        position:     'absolute',
        top:          0,
        left:         0,
        right:        0,
        height:       '2px',
        background:   color,
        opacity:      0.6,
      }} />

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width:        '36px',
            height:       '36px',
            borderRadius: '8px',
            background:   `${color}15`,
            border:       `1px solid ${color}30`,
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontSize:     '18px',
          }}>
            {meta.icon}
          </div>
          <div>
            <p style={{ color: 'white', fontWeight: 700, fontSize: '14px', margin: 0 }}>
              {agentKey}
            </p>
            <p style={{ color: '#6b7280', fontSize: '11px', margin: '2px 0 0' }}>
              :{meta.port} · {meta.language}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{
            fontSize:     '10px',
            fontWeight:   700,
            padding:      '2px 8px',
            borderRadius: '999px',
            color:        color,
            background:   `${color}15`,
            letterSpacing: '0.06em',
          }}>
            {state.status.toUpperCase()}
          </span>
          {state.failures > 0 && (
            <span style={{ fontSize: '10px', color: '#f87171' }}>
              ✗ {state.failures} échec{state.failures > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p style={{ color: '#9ca3af', fontSize: '12px', marginBottom: '12px', lineHeight: 1.5 }}>
        {meta.description}
      </p>

      {/* Métriques santé */}
      {health && (
        <div style={{
          display:       'flex',
          gap:           '12px',
          marginBottom:  '12px',
          flexWrap:      'wrap',
        }}>
          {uptimeStr && (
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              Uptime <span style={{ color: '#d1d5db', fontWeight: 600 }}>{uptimeStr}</span>
            </div>
          )}
          {health.memory && (
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              RAM <span style={{ color: '#d1d5db', fontWeight: 600 }}>
                {Math.round(health.memory.used / 1024 / 1024)}MB
              </span>
            </div>
          )}
          {health.version && (
            <div style={{ fontSize: '11px', color: '#6b7280' }}>
              v<span style={{ color: '#d1d5db', fontWeight: 600 }}>{health.version}</span>
            </div>
          )}
        </div>
      )}

      {/* Last seen */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', color: '#4b5563' }}>
          {state.lastSeen > 0
            ? `Vu ${new Date(state.lastSeen).toLocaleTimeString('fr-FR')}`
            : 'Jamais vu'}
        </span>
        <button
          onClick={checkHealth}
          disabled={loading}
          style={{
            background:   'rgba(255,255,255,0.06)',
            border:       '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            color:        '#9ca3af',
            fontSize:     '11px',
            padding:      '3px 8px',
            cursor:       loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '…' : '↻ Ping'}
        </button>
      </div>
    </div>
  );
}

// ─── Barre de stats globale ───────────────────────────────────────────────────

function GlobalStats({ agents }: { agents: Record<string, AgentState> }) {
  const values    = Object.values(agents);
  const healthy   = values.filter((a) => a.status === 'healthy').length;
  const down      = values.filter((a) => a.status === 'down').length;
  const degraded  = values.filter((a) => a.status === 'degraded').length;
  const unknown   = values.filter((a) => a.status === 'unknown').length;
  const total     = values.length;

  return (
    <div style={{
      display:       'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap:           '12px',
      marginBottom:  '28px',
    }}>
      {[
        { label: 'Total',      value: total,    color: '#9ca3af' },
        { label: 'Sains',      value: healthy,  color: '#4ade80' },
        { label: 'En panne',   value: down,     color: '#f87171' },
        { label: 'Dégradés',   value: degraded + unknown, color: '#facc15' },
      ].map(({ label, value, color }) => (
        <div key={label} style={{
          background:   '#1a1d27',
          border:       '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px',
          padding:      '14px 18px',
          textAlign:    'center',
        }}>
          <p style={{ color, fontSize: '28px', fontWeight: 800, margin: '0 0 4px' }}>{value}</p>
          <p style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AgentsPage() {
  const agents    = useChimeraStore((s) => s.agents);
  const connected = useChimeraStore((s) => s.connected);
  useChimeraSocket(); // connexion WS pour mise à jour en temps réel

  // Ajouter Queen comme agent virtuel
  const allAgents: Record<string, AgentState> = {
    queen: {
      name:     'queen',
      status:   connected ? 'healthy' : 'unknown',
      port:     3000,
      failures: 0,
      lastSeen: connected ? Date.now() : 0,
    },
    ...agents,
  };

  return (
    <div style={{
      minHeight:  '100vh',
      background: '#0f1117',
      padding:    '24px 32px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px',
          }}>
            🐝
          </div>
          <div>
            <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 700, margin: 0 }}>
              Agents Chimera
            </h1>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '2px 0 0' }}>
              Queen + 8 agents Python · WebSocket {connected ? '🟢 connecté' : '🔴 déconnecté'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats globales */}
      <GlobalStats agents={allAgents} />

      {/* Grille agents */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap:                 '16px',
      }}>
        {Object.entries(allAgents).map(([key, state]) => (
          <AgentCard key={key} agentKey={key} state={state} />
        ))}
      </div>

      {/* Message si aucun agent */}
      {Object.keys(agents).length === 0 && !connected && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔴</div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#9ca3af' }}>Queen non connectée</p>
          <p style={{ fontSize: '13px' }}>Lance <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px' }}>pnpm dev</code> dans chimera/</p>
        </div>
      )}
    </div>
  );
}
