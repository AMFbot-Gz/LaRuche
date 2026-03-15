'use client';

/**
 * app/chimera/page.tsx — Dashboard temps réel Chimera
 *
 * 3 widgets principaux :
 *   HiveStatus   — statut de la Queen + 7 couches Python
 *   LiveLogs     — flux d'événements en temps réel
 *   QuickAction  — envoyer une mission à la Queen
 */

import React, { useState, FormEvent } from 'react';
import { useChimeraSocket } from '../../hooks/useChimeraSocket';
import { useChimeraStore }  from '../../store/chimera';
import { HitlCard }         from '../../components/HitlCard';
import { HitlBadge }        from '../../components/HitlBadge';

// ══════════════════════════════════════════════════════════════════════════════
// Widget 1 — HiveStatus
// ══════════════════════════════════════════════════════════════════════════════

function HiveStatus() {
  const connected     = useChimeraStore((s) => s.connected);
  const agents        = useChimeraStore((s) => s.agents);
  const activeMission = useChimeraStore((s) => s.activeMission);

  const statusColor: Record<string, string> = {
    healthy:  '#4ade80',
    down:     '#f87171',
    degraded: '#facc15',
    unknown:  '#6b7280',
  };

  return (
    <div style={cardStyle}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>🐝</span>
          <h3 style={{ color: 'white', fontWeight: 700, fontSize: '15px', margin: 0 }}>Ruche Chimera</h3>
        </div>
        <span style={{
          fontSize: '11px', fontWeight: 600, padding: '3px 10px',
          borderRadius: '999px',
          background: connected ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
          color:      connected ? '#4ade80' : '#f87171',
          border:     `1px solid ${connected ? '#4ade80' : '#f87171'}`,
        }}>
          {connected ? '● EN LIGNE' : '○ HORS LIGNE'}
        </span>
      </div>

      {/* Mission active */}
      {activeMission && (
        <div style={{
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: '8px', padding: '10px 12px', marginBottom: '14px',
        }}>
          <p style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600, margin: '0 0 4px' }}>MISSION EN COURS</p>
          <p style={{ fontSize: '13px', color: 'white', margin: 0 }}>
            {activeMission.command.slice(0, 80)}{activeMission.command.length > 80 ? '…' : ''}
          </p>
        </div>
      )}

      {/* Grille agents */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {/* Queen (Node.js) */}
        <div style={{
          ...agentTileStyle,
          gridColumn: '1 / -1',
          borderColor: connected ? 'rgba(74,222,128,0.3)' : 'rgba(107,114,128,0.3)',
        }}>
          <span style={{ fontSize: '14px' }}>👑</span>
          <div style={{ flex: 1 }}>
            <p style={{ color: 'white', fontWeight: 600, fontSize: '13px', margin: 0 }}>Queen Node.js</p>
            <p style={{ color: '#9ca3af', fontSize: '11px', margin: '2px 0 0' }}>:3000 · WS :9002</p>
          </div>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: connected ? '#4ade80' : '#6b7280',
            flexShrink: 0,
          }} />
        </div>

        {/* 7 agents Python */}
        {Object.values(agents).map((agent) => (
          <div key={agent.name} style={{
            ...agentTileStyle,
            borderColor: `${statusColor[agent.status] ?? '#6b7280'}30`,
          }}>
            <span style={{ fontSize: '12px' }}>{agentIcon[agent.name] ?? '🔧'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: 'white', fontWeight: 600, fontSize: '12px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {agent.name}
              </p>
              <p style={{ color: '#9ca3af', fontSize: '10px', margin: '2px 0 0' }}>
                :{agent.port}{agent.failures > 0 ? ` · ✗${agent.failures}` : ''}
              </p>
            </div>
            <span style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: statusColor[agent.status] ?? '#6b7280',
              flexShrink: 0,
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget 2 — LiveLogs
// ══════════════════════════════════════════════════════════════════════════════

function LiveLogs() {
  const logs     = useChimeraStore((s) => s.logs);
  const clearLogs = useChimeraStore((s) => s.clearLogs);

  const typeColor: Record<string, string> = {
    system:            '#6b7280',
    mission_start:     '#60a5fa',
    mission_accepted:  '#60a5fa',
    mission_complete:  '#4ade80',
    mission_error:     '#f87171',
    task_start:        '#a78bfa',
    task_done:         '#34d399',
    thinking:          '#fbbf24',
    'layer.down':      '#f87171',
    'layer.up':        '#4ade80',
    queue_update:      '#94a3b8',
    plan_ready:        '#818cf8',
  };

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📡</span>
          <h3 style={{ color: 'white', fontWeight: 700, fontSize: '15px', margin: 0 }}>Flux en direct</h3>
          {logs.length > 0 && (
            <span style={{ fontSize: '11px', color: '#9ca3af', background: 'rgba(255,255,255,0.06)', padding: '1px 7px', borderRadius: '999px' }}>
              {logs.length}
            </span>
          )}
        </div>
        <button onClick={clearLogs} style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px',
          color: '#9ca3af', fontSize: '11px', padding: '3px 8px', cursor: 'pointer',
        }}>
          Vider
        </button>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', maxHeight: '360px',
        display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        {logs.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '12px', textAlign: 'center', marginTop: '32px' }}>
            En attente d'événements…
          </p>
        ) : (
          logs.map((log) => (
            <div key={log.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: '8px',
              padding: '6px 8px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.03)',
              borderLeft: `2px solid ${typeColor[log.type] ?? '#4b5563'}`,
            }}>
              <span style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace', flexShrink: 0, marginTop: '1px' }}>
                {new Date(log.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: typeColor[log.type] ?? '#4b5563', textTransform: 'uppercase', marginRight: '6px' }}>
                  {log.type}
                </span>
                <span style={{ fontSize: '12px', color: '#d1d5db', wordBreak: 'break-word' }}>
                  {log.message}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Widget 3 — QuickAction
// ══════════════════════════════════════════════════════════════════════════════

function QuickAction({ sendCommand }: { sendCommand: (type: string, data?: Record<string, unknown>) => void }) {
  const [input,   setInput]   = useState('');
  const [sending, setSending] = useState(false);
  const connected = useChimeraStore((s) => s.connected);

  const presets = [
    { label: '🔍 Statut cluster',  command: 'Donne-moi le statut de tous les agents Python' },
    { label: '📊 Résumé missions', command: 'Résume les 5 dernières missions exécutées' },
    { label: '🔧 Heal agents',     command: 'Vérifie et relance les agents Python en erreur' },
  ];

  function submit(cmd: string) {
    if (!cmd.trim() || !connected) return;
    setSending(true);
    sendCommand('run_mission', { command: cmd.trim() });
    setInput('');
    setTimeout(() => setSending(false), 1000);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(input);
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '18px' }}>⚡</span>
        <h3 style={{ color: 'white', fontWeight: 700, fontSize: '15px', margin: 0 }}>Action rapide</h3>
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => submit(p.command)}
            disabled={!connected || sending}
            style={{
              background:    'rgba(255,255,255,0.05)',
              border:        '1px solid rgba(255,255,255,0.1)',
              borderRadius:  '8px',
              color:         connected ? '#d1d5db' : '#6b7280',
              fontSize:      '13px',
              padding:       '10px 14px',
              textAlign:     'left',
              cursor:        connected ? 'pointer' : 'not-allowed',
              transition:    'background 0.15s',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Champ libre */}
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? 'Mission libre…' : 'Hors ligne'}
          disabled={!connected || sending}
          style={{
            flex:          1,
            background:    'rgba(255,255,255,0.06)',
            border:        '1px solid rgba(255,255,255,0.12)',
            borderRadius:  '8px',
            color:         'white',
            fontSize:      '13px',
            padding:       '10px 12px',
            outline:       'none',
          }}
        />
        <button
          type="submit"
          disabled={!connected || !input.trim() || sending}
          style={{
            background:   'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border:       'none',
            borderRadius: '8px',
            color:        'white',
            fontWeight:   700,
            fontSize:     '13px',
            padding:      '10px 18px',
            cursor:       connected && input.trim() ? 'pointer' : 'not-allowed',
            opacity:      connected && input.trim() ? 1 : 0.45,
            transition:   'opacity 0.15s',
          }}
        >
          {sending ? '…' : '▶'}
        </button>
      </form>

      {!connected && (
        <p style={{ fontSize: '11px', color: '#f87171', marginTop: '10px', textAlign: 'center' }}>
          Non connecté à la Queen — vérifier ws://localhost:9002
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Page principale
// ══════════════════════════════════════════════════════════════════════════════

export default function ChimeraPage() {
  const { sendCommand } = useChimeraSocket();
  const hitlRequests    = useChimeraStore((s) => s.hitlRequests);

  return (
    <div style={{
      minHeight:  '100vh',
      background: '#0f1117',
      padding:    '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px',
          }}>
            🧠
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 700, margin: 0 }}>
                Chimera OS
              </h1>
              <HitlBadge />
            </div>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '2px 0 0' }}>
              Dashboard temps réel · Queen + 7 agents
            </p>
          </div>
        </div>
      </div>

      {/* Grille widgets */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: '340px 1fr 300px',
        gap:                 '16px',
        alignItems:          'start',
      }}>
        <HiveStatus />
        <LiveLogs />
        <QuickAction sendCommand={sendCommand} />
      </div>

      {/* Panneau flottant HITL — rendu en dehors de la grille pour position:fixed */}
      <HitlCard requests={hitlRequests} />
    </div>
  );
}

// ─── Styles partagés ──────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background:   '#1a1d27',
  border:       '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding:      '18px',
};

const agentTileStyle: React.CSSProperties = {
  display:      'flex',
  alignItems:   'center',
  gap:          '8px',
  background:   'rgba(255,255,255,0.03)',
  border:       '1px solid',
  borderRadius: '8px',
  padding:      '8px 10px',
};

const agentIcon: Record<string, string> = {
  orchestration: '🎯',
  perception:    '👁',
  brain:         '🧠',
  executor:      '⚙️',
  evolution:     '🧬',
  memory:        '💾',
  'mcp-bridge':  '🌉',
};
