'use client';

/**
 * app/(app)/memory/page.tsx — Navigateur mémoire Chimera
 *
 * Affiche la mémoire épisodique de l'agent (épisodes stockés par l'Architecte).
 * Permet de rechercher et filtrer par type/agent.
 */

import React, { useState } from 'react';
import { useChimeraStore } from '../../../store/chimera';

// ─── Types ────────────────────────────────────────────────────────────────────

type MemoryType = 'episodic' | 'semantic' | 'skill' | 'observation';

interface MemoryEntry {
  id:        string;
  type:      MemoryType;
  agent:     string;
  content:   string;
  tags:      string[];
  createdAt: number;
  importance: number; // 1-5
}

// ─── Données démo ─────────────────────────────────────────────────────────────

const DEMO_MEMORIES: MemoryEntry[] = [
  {
    id: 'mem_001', type: 'episodic', agent: 'brain',
    content: 'Mission réussie : tous les agents Python ont été vérifiés et sont en ligne (9/9).',
    tags: ['mission', 'health-check', 'agents'],
    createdAt: Date.now() - 120000, importance: 3,
  },
  {
    id: 'mem_002', type: 'semantic', agent: 'memory',
    content: 'Architecture Chimera : Queen Node.js :3000 + 9 agents Python FastAPI + Dashboard Next.js :3001 + WS :9002.',
    tags: ['architecture', 'chimera', 'stack'],
    createdAt: Date.now() - 600000, importance: 5,
  },
  {
    id: 'mem_003', type: 'skill', agent: 'brain',
    content: 'Skill appris : monitor_agents — vérifie le statut HTTP /health de chaque agent et alerte si down.',
    tags: ['skill', 'monitoring', 'agents'],
    createdAt: Date.now() - 1800000, importance: 4,
  },
  {
    id: 'mem_004', type: 'observation', agent: 'perception',
    content: 'Observation : agent "evolution" :8005 présente des latences élevées (>800ms) sur /health depuis 10 minutes.',
    tags: ['observation', 'evolution', 'latency'],
    createdAt: Date.now() - 300000, importance: 4,
  },
  {
    id: 'mem_005', type: 'episodic', agent: 'orchestration',
    content: 'Mission planifiée et décomposée en 3 tâches : 1) scan cluster 2) identifier erreurs 3) générer rapport.',
    tags: ['mission', 'planning', 'tasks'],
    createdAt: Date.now() - 900000, importance: 2,
  },
  {
    id: 'mem_006', type: 'semantic', agent: 'knowledge',
    content: 'Clio est la co-fondatrice IA de Chimera. Elle orchestre les missions et maintient la mémoire long terme.',
    tags: ['clio', 'identity', 'chimera'],
    createdAt: Date.now() - 3600000, importance: 5,
  },
  {
    id: 'mem_007', type: 'skill', agent: 'brain',
    content: 'Skill appris : generate_report — génère un rapport markdown des missions avec résumé, métriques et recommandations.',
    tags: ['skill', 'reporting', 'markdown'],
    createdAt: Date.now() - 7200000, importance: 3,
  },
];

// ─── Composant MemoryCard ─────────────────────────────────────────────────────

function MemoryCard({ m }: { m: MemoryEntry }) {
  const typeConfig: Record<MemoryType, { color: string; icon: string; label: string }> = {
    episodic:    { color: '#60a5fa', icon: '📖', label: 'Épisodique' },
    semantic:    { color: '#a78bfa', icon: '🧠', label: 'Sémantique' },
    skill:       { color: '#34d399', icon: '🧩', label: 'Skill'      },
    observation: { color: '#fbbf24', icon: '👁',  label: 'Observation'},
  };
  const cfg = typeConfig[m.type];

  const stars = Array.from({ length: 5 }, (_, i) => i < m.importance ? '★' : '☆').join('');

  return (
    <div style={{
      background:   '#1a1d27',
      border:       '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding:      '14px 16px',
    }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <span style={{ fontSize: '16px' }}>{cfg.icon}</span>
        <span style={{
          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
          background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}40`,
        }}>
          {cfg.label.toUpperCase()}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: '#f59e0b', letterSpacing: '-1px' }}>{stars}</span>
        <span style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' }}>
          {m.agent}
        </span>
      </div>

      {/* Contenu */}
      <p style={{ fontSize: '13px', color: '#d1d5db', margin: '0 0 10px', lineHeight: '1.5' }}>
        {m.content}
      </p>

      {/* Tags + date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {m.tags.map((tag) => (
          <span key={tag} style={{
            fontSize: '10px', padding: '2px 8px', borderRadius: '999px',
            background: 'rgba(255,255,255,0.06)', color: '#9ca3af',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            #{tag}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '10px', color: '#4b5563', fontFamily: 'monospace' }}>
          {new Date(m.createdAt).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function MemoryPage() {
  const connected = useChimeraStore((s) => s.connected);
  const [search, setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<MemoryType | 'all'>('all');
  const [sortBy, setSortBy]     = useState<'date' | 'importance'>('date');

  const filtered = DEMO_MEMORIES
    .filter((m) => {
      const matchType = typeFilter === 'all' || m.type === typeFilter;
      const q = search.toLowerCase();
      const matchSearch = !q || m.content.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q)) || m.agent.includes(q);
      return matchType && matchSearch;
    })
    .sort((a, b) =>
      sortBy === 'date' ? b.createdAt - a.createdAt : b.importance - a.importance
    );

  const typeTabs: { key: MemoryType | 'all'; label: string }[] = [
    { key: 'all',         label: 'Toutes'        },
    { key: 'episodic',    label: 'Épisodique'    },
    { key: 'semantic',    label: 'Sémantique'    },
    { key: 'skill',       label: 'Skills'        },
    { key: 'observation', label: 'Observations'  },
  ];

  const stats = {
    total:    DEMO_MEMORIES.length,
    episodic: DEMO_MEMORIES.filter((m) => m.type === 'episodic').length,
    skills:   DEMO_MEMORIES.filter((m) => m.type === 'skill').length,
    avg:      (DEMO_MEMORIES.reduce((s, m) => s + m.importance, 0) / DEMO_MEMORIES.length).toFixed(1),
  };

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
            background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
          }}>💾</div>
          <div>
            <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 700, margin: 0 }}>Mémoire</h1>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '2px 0 0' }}>
              Mémoire épisodique, sémantique et skills de Clio
            </p>
          </div>
        </div>
        <span style={{
          fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '999px',
          background: connected ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          color:      connected ? '#4ade80' : '#f87171',
          border:     `1px solid ${connected ? '#4ade8040' : '#f8717140'}`,
        }}>
          {connected ? '● EN LIGNE' : '○ HORS LIGNE'}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {[
          { label: 'Total',      value: stats.total,    icon: '📚', color: '#818cf8' },
          { label: 'Épisodes',   value: stats.episodic, icon: '📖', color: '#60a5fa' },
          { label: 'Skills',     value: stats.skills,   icon: '🧩', color: '#34d399' },
          { label: 'Importance', value: `${stats.avg}/5`, icon: '⭐', color: '#fbbf24' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{
            background: '#1a1d27', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '14px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span>{icon}</span>
              <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 600 }}>{label.toUpperCase()}</span>
            </div>
            <p style={{ color, fontSize: '24px', fontWeight: 700, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Barre de recherche + tri */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher dans la mémoire…"
          style={{
            flex: 1, background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: 'white', fontSize: '13px', padding: '9px 14px', outline: 'none',
          }}
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'date' | 'importance')}
          style={{
            background: '#1a1d27', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: '#9ca3af', fontSize: '12px', padding: '9px 12px', outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="date">Tri : Date</option>
          <option value="importance">Tri : Importance</option>
        </select>
      </div>

      {/* Filtres type */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {typeTabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            style={{
              background:   typeFilter === key ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
              border:       `1px solid ${typeFilter === key ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: '8px', color: typeFilter === key ? '#818cf8' : '#9ca3af',
              fontSize: '12px', fontWeight: typeFilter === key ? 700 : 500,
              padding: '6px 14px', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grille mémoires */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#4b5563' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>💾</p>
          <p style={{ fontSize: '14px' }}>Aucune entrée mémoire trouvée</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map((m) => <MemoryCard key={m.id} m={m} />)}
        </div>
      )}
    </div>
  );
}
