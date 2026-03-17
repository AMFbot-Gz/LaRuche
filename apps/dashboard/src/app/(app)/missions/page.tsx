'use client';

/**
 * app/(app)/missions/page.tsx — Liste des missions Chimera
 *
 * Affiche les missions passées/en cours avec statut, durée, agent assigné.
 * Permet de lancer une nouvelle mission.
 */

import React, { useState, FormEvent } from 'react';
import { useChimeraSocket } from '../../../hooks/useChimeraSocket';
import { useChimeraStore }  from '../../../store/chimera';

// ─── Types locaux ─────────────────────────────────────────────────────────────

type MissionStatus = 'pending' | 'running' | 'done' | 'error';

interface Mission {
  id:        string;
  command:   string;
  status:    MissionStatus;
  agent:     string;
  startedAt: number;
  endedAt?:  number;
  result?:   string;
}

// ─── Composant MissionRow ─────────────────────────────────────────────────────

function MissionRow({ m }: { m: Mission }) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig: Record<MissionStatus, { color: string; label: string; dot: string }> = {
    pending: { color: '#fbbf24', label: 'EN ATTENTE', dot: '#fbbf24' },
    running: { color: '#60a5fa', label: 'EN COURS',   dot: '#60a5fa' },
    done:    { color: '#4ade80', label: 'TERMINÉ',    dot: '#4ade80' },
    error:   { color: '#f87171', label: 'ERREUR',     dot: '#f87171' },
  };

  const cfg = statusConfig[m.status];
  const duration = m.endedAt
    ? `${((m.endedAt - m.startedAt) / 1000).toFixed(1)}s`
    : m.status === 'running'
    ? `${((Date.now() - m.startedAt) / 1000).toFixed(0)}s…`
    : '—';

  return (
    <div style={{
      background:   '#1a1d27',
      border:       '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      marginBottom: '8px',
      overflow:     'hidden',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display:    'flex',
          alignItems: 'center',
          gap:        '12px',
          padding:    '12px 16px',
          cursor:     'pointer',
        }}
      >
        {/* Dot statut */}
        <span style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: cfg.dot, flexShrink: 0,
          boxShadow: m.status === 'running' ? `0 0 6px ${cfg.dot}` : 'none',
        }} />

        {/* Commande */}
        <p style={{ flex: 1, color: 'white', fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.command}
        </p>

        {/* Badge statut */}
        <span style={{
          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
          background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}40`,
          flexShrink: 0,
        }}>
          {cfg.label}
        </span>

        {/* Agent */}
        <span style={{ fontSize: '11px', color: '#6b7280', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>
          {m.agent}
        </span>

        {/* Durée */}
        <span style={{ fontSize: '11px', color: '#4b5563', flexShrink: 0, minWidth: '50px', textAlign: 'right', fontFamily: 'monospace' }}>
          {duration}
        </span>

        {/* Toggle */}
        <span style={{ color: '#4b5563', fontSize: '12px', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Détails */}
      {expanded && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding:   '12px 16px',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', gap: '24px', marginBottom: m.result ? '10px' : '0' }}>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>
              ID : <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>{m.id}</span>
            </span>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>
              Démarré : <span style={{ color: '#9ca3af' }}>
                {new Date(m.startedAt).toLocaleTimeString('fr-FR')}
              </span>
            </span>
            {m.endedAt && (
              <span style={{ fontSize: '11px', color: '#6b7280' }}>
                Terminé : <span style={{ color: '#9ca3af' }}>
                  {new Date(m.endedAt).toLocaleTimeString('fr-FR')}
                </span>
              </span>
            )}
          </div>
          {m.result && (
            <pre style={{
              fontSize: '12px', color: '#d1d5db', fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '10px',
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflowY: 'auto',
            }}>
              {m.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function MissionsPage() {
  const { sendCommand }   = useChimeraSocket();
  const connected         = useChimeraStore((s) => s.connected);
  const activeMission     = useChimeraStore((s) => s.activeMission);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<MissionStatus | 'all'>('all');

  // Missions synthétisées depuis le store + historique simulé pour la démo
  const demoMissions: Mission[] = [
    ...(activeMission ? [{
      id:        activeMission.id,
      command:   activeMission.command,
      status:    'running' as MissionStatus,
      agent:     'orchestration',
      startedAt: activeMission.startTs,
    }] : []),
    {
      id: 'msn_001', command: 'Vérifie et relance les agents Python en erreur',
      status: 'done', agent: 'brain', startedAt: Date.now() - 120000, endedAt: Date.now() - 108000,
      result: 'Agents vérifiés : 9/9 en ligne. Aucun redémarrage nécessaire.',
    },
    {
      id: 'msn_002', command: 'Résume les 5 dernières missions exécutées',
      status: 'done', agent: 'memory', startedAt: Date.now() - 300000, endedAt: Date.now() - 295000,
      result: 'Missions récupérées depuis la mémoire épisodique.',
    },
    {
      id: 'msn_003', command: 'Analyse les logs d\'erreur du cluster',
      status: 'error', agent: 'perception', startedAt: Date.now() - 600000, endedAt: Date.now() - 598000,
      result: 'Erreur : timeout lors de la connexion au log aggregator.',
    },
  ];

  const filtered = filter === 'all' ? demoMissions : demoMissions.filter((m) => m.status === filter);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || !connected) return;
    sendCommand('run_mission', { command: input.trim() });
    setInput('');
  }

  const counts: Record<string, number> = { all: demoMissions.length };
  for (const m of demoMissions) counts[m.status] = (counts[m.status] ?? 0) + 1;

  const filterTabs: { key: MissionStatus | 'all'; label: string }[] = [
    { key: 'all',     label: `Toutes (${counts.all ?? 0})`     },
    { key: 'running', label: `En cours (${counts.running ?? 0})` },
    { key: 'done',    label: `Terminées (${counts.done ?? 0})`  },
    { key: 'error',   label: `Erreurs (${counts.error ?? 0})`   },
  ];

  return (
    <div style={{
      minHeight:  '100vh',
      background: '#0f1117',
      padding:    '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #f59e0b, #f97316)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
          }}>🎯</div>
          <div>
            <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 700, margin: 0 }}>Missions</h1>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '2px 0 0' }}>
              Historique et lancement de missions
            </p>
          </div>
        </div>

        {/* Indicateur connexion */}
        <span style={{
          fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '999px',
          background: connected ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          color:      connected ? '#4ade80' : '#f87171',
          border:     `1px solid ${connected ? '#4ade8040' : '#f8717140'}`,
        }}>
          {connected ? '● EN LIGNE' : '○ HORS LIGNE'}
        </span>
      </div>

      {/* Formulaire nouvelle mission */}
      <div style={{
        background:   '#1a1d27',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding:      '16px',
        marginBottom: '20px',
      }}>
        <p style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 600, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Nouvelle mission
        </p>
        <form onSubmit={submit} style={{ display: 'flex', gap: '8px' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={connected ? 'Décris la mission à exécuter…' : 'Non connecté à la Queen'}
            disabled={!connected}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '8px', color: 'white', fontSize: '13px', padding: '10px 14px', outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!connected || !input.trim()}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: '8px', color: 'white', fontWeight: 700,
              fontSize: '13px', padding: '10px 20px', cursor: connected && input.trim() ? 'pointer' : 'not-allowed',
              opacity: connected && input.trim() ? 1 : 0.45, transition: 'opacity 0.15s',
            }}
          >
            Lancer ▶
          </button>
        </form>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {filterTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              background:   filter === key ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
              border:       `1px solid ${filter === key ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '8px', color: filter === key ? '#818cf8' : '#9ca3af',
              fontSize: '12px', fontWeight: filter === key ? 700 : 500,
              padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Liste missions */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#4b5563' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>🎯</p>
          <p style={{ fontSize: '14px' }}>Aucune mission dans cette catégorie</p>
        </div>
      ) : (
        filtered.map((m) => <MissionRow key={m.id} m={m} />)
      )}
    </div>
  );
}
