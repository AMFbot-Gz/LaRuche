'use client';

/**
 * app/sessions/page.tsx — Sessions Computer Use en temps réel
 *
 * Affiche les sessions actives et l'historique des sessions Computer Use.
 * Permet de démarrer une nouvelle session avec un goal et de suivre
 * sa progression (step par step) en temps réel via la Queen.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useChimeraSocket } from '../../../hooks/useChimeraSocket';
import { useChimeraStore }  from '../../../store/chimera';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

interface ComputerUseSession {
  sessionId:   string;
  goal:        string;
  status:      SessionStatus;
  currentStep: number;
  maxSteps:    number;
  startedAt:   number;
  endedAt?:    number;
  lastAction?: string;
}

// ─── Constantes style ─────────────────────────────────────────────────────────

const QUEEN_URL = process.env.NEXT_PUBLIC_QUEEN_URL ?? 'http://localhost:3000';

const statusConfig: Record<SessionStatus, { label: string; color: string; bg: string }> = {
  running:   { label: 'EN COURS',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'  },
  completed: { label: 'TERMINÉE',    color: '#4ade80', bg: 'rgba(74,222,128,0.1)'  },
  failed:    { label: 'ÉCHOUÉE',     color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
  cancelled: { label: 'ANNULÉE',     color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
};

// ─── Composant SessionCard ─────────────────────────────────────────────────────

function SessionCard({ session, onCancel }: { session: ComputerUseSession; onCancel: (id: string) => void }) {
  const cfg      = statusConfig[session.status];
  const elapsed  = (((session.endedAt ?? Date.now()) - session.startedAt) / 1000).toFixed(1);
  const progress = session.maxSteps > 0 ? Math.round((session.currentStep / session.maxSteps) * 100) : 0;

  return (
    <div style={{
      background:   '#1a1d27',
      border:       '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding:      '20px',
      marginBottom: '12px',
    }}>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{
              fontSize:     '11px',
              fontWeight:   700,
              padding:      '2px 8px',
              borderRadius: '999px',
              color:        cfg.color,
              background:   cfg.bg,
              border:       `1px solid ${cfg.color}30`,
              letterSpacing: '0.06em',
            }}>
              {cfg.label}
            </span>
            <span style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace' }}>
              {session.sessionId.slice(0, 12)}…
            </span>
          </div>
          <p style={{ color: 'white', fontWeight: 600, fontSize: '14px', margin: 0, lineHeight: 1.4 }}>
            {session.goal}
          </p>
        </div>
        {session.status === 'running' && (
          <button
            onClick={() => onCancel(session.sessionId)}
            style={{
              background:   'rgba(248,113,113,0.12)',
              border:       '1px solid rgba(248,113,113,0.3)',
              borderRadius: '6px',
              color:        '#f87171',
              fontSize:     '12px',
              fontWeight:   600,
              padding:      '5px 10px',
              cursor:       'pointer',
              flexShrink:   0,
            }}
          >
            Annuler
          </button>
        )}
      </div>

      {/* Barre de progression */}
      {session.status === 'running' && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
              Étape {session.currentStep} / {session.maxSteps}
            </span>
            <span style={{ fontSize: '11px', color: '#9ca3af' }}>{progress}%</span>
          </div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }}>
            <div style={{
              height:       '100%',
              width:        `${progress}%`,
              background:   'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: '999px',
              transition:   'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Dernière action */}
      {session.lastAction && (
        <div style={{
          background:   'rgba(255,255,255,0.03)',
          border:       '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px',
          padding:      '8px 12px',
          marginBottom: '10px',
        }}>
          <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 3px', fontWeight: 600 }}>DERNIÈRE ACTION</p>
          <p style={{ fontSize: '12px', color: '#d1d5db', margin: 0, fontFamily: 'monospace' }}>
            {session.lastAction}
          </p>
        </div>
      )}

      {/* Méta */}
      <div style={{ display: 'flex', gap: '16px' }}>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>
          Démarré {new Date(session.startedAt).toLocaleTimeString('fr-FR')}
        </span>
        <span style={{ fontSize: '11px', color: '#6b7280' }}>
          {elapsed}s écoulées
        </span>
      </div>
    </div>
  );
}

// ─── Composant NewSessionForm ─────────────────────────────────────────────────

function NewSessionForm({ onStart }: { onStart: (goal: string, maxSteps: number) => void }) {
  const [goal,     setGoal]     = useState('');
  const [maxSteps, setMaxSteps] = useState(20);
  const [loading,  setLoading]  = useState(false);

  const presets = [
    'Prends une capture d\'écran et décris ce que tu vois',
    'Ouvre le Terminal et liste les fichiers du projet Chimera',
    'Vérifie que tous les agents Python sont bien démarrés',
    'Recherche "Chimera OS" sur GitHub et donne-moi le résultat',
  ];

  async function submit() {
    if (!goal.trim()) return;
    setLoading(true);
    await onStart(goal.trim(), maxSteps);
    setGoal('');
    setLoading(false);
  }

  return (
    <div style={{
      background:   '#1a1d27',
      border:       '1px solid rgba(99,102,241,0.25)',
      borderRadius: '12px',
      padding:      '20px',
      marginBottom: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '18px' }}>🖥</span>
        <h3 style={{ color: 'white', fontWeight: 700, fontSize: '15px', margin: 0 }}>
          Nouvelle session Computer Use
        </h3>
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => setGoal(p)}
            style={{
              background:   'rgba(255,255,255,0.05)',
              border:       '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              color:        '#9ca3af',
              fontSize:     '11px',
              padding:      '4px 10px',
              cursor:       'pointer',
            }}
          >
            {p.slice(0, 42)}…
          </button>
        ))}
      </div>

      {/* Textarea goal */}
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Décris l'objectif que Chimera doit accomplir sur l'écran…"
        rows={3}
        style={{
          width:        '100%',
          background:   'rgba(255,255,255,0.06)',
          border:       '1px solid rgba(255,255,255,0.12)',
          borderRadius: '8px',
          color:        'white',
          fontSize:     '13px',
          padding:      '10px 12px',
          outline:      'none',
          resize:       'vertical',
          marginBottom: '12px',
          boxSizing:    'border-box',
          fontFamily:   'system-ui, sans-serif',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#9ca3af', fontSize: '12px' }}>
          Max étapes :
          <input
            type="number"
            min={1}
            max={50}
            value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value))}
            style={{
              width:        '60px',
              background:   'rgba(255,255,255,0.08)',
              border:       '1px solid rgba(255,255,255,0.15)',
              borderRadius: '6px',
              color:        'white',
              fontSize:     '12px',
              padding:      '4px 8px',
              textAlign:    'center',
              outline:      'none',
            }}
          />
        </label>

        <button
          onClick={submit}
          disabled={!goal.trim() || loading}
          style={{
            background:   goal.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.08)',
            border:       'none',
            borderRadius: '8px',
            color:        goal.trim() ? 'white' : '#6b7280',
            fontWeight:   700,
            fontSize:     '13px',
            padding:      '10px 20px',
            cursor:       goal.trim() && !loading ? 'pointer' : 'not-allowed',
            transition:   'all 0.2s',
          }}
        >
          {loading ? 'Démarrage…' : '▶ Lancer'}
        </button>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SessionsPage() {
  const [sessions, setSessions] = useState<ComputerUseSession[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  const connected = useChimeraStore((s) => s.connected);
  const { sendCommand } = useChimeraSocket();

  // Polling des sessions actives toutes les 3s
  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch(`${QUEEN_URL}/api/computer-use/sessions`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSessions(data.sessions ?? []);
        setError(null);
      } catch (e) {
        setError('Queen non accessible — démarrer avec pnpm dev');
      }
    }
    fetchSessions();
    const interval = setInterval(fetchSessions, 3_000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = useCallback(async (goal: string, maxSteps: number) => {
    try {
      const res = await fetch(`${QUEEN_URL}/api/computer-use/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ goal, maxSteps }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setError('Impossible de démarrer la session');
    }
  }, []);

  const handleCancel = useCallback(async (sessionId: string) => {
    try {
      await fetch(`${QUEEN_URL}/api/computer-use/sessions/${sessionId}`, { method: 'DELETE' });
    } catch {
      // silencieux
    }
  }, []);

  const active    = sessions.filter((s) => s.status === 'running');
  const completed = sessions.filter((s) => s.status !== 'running');

  return (
    <div style={{
      minHeight:  '100vh',
      background: '#0f1117',
      padding:    '24px 32px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px',
          }}>
            🖥
          </div>
          <div>
            <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 700, margin: 0 }}>
              Sessions Computer Use
            </h1>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '2px 0 0' }}>
              {active.length} session{active.length !== 1 ? 's' : ''} active{active.length !== 1 ? 's' : ''} · Queen {connected ? '🟢' : '🔴'}
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background:   'rgba(248,113,113,0.1)',
            border:       '1px solid rgba(248,113,113,0.3)',
            borderRadius: '8px',
            padding:      '10px 14px',
            color:        '#f87171',
            fontSize:     '13px',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Formulaire nouvelle session */}
      <NewSessionForm onStart={handleStart} />

      {/* Sessions actives */}
      {active.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
            ACTIVES ({active.length})
          </h2>
          {active.map((s) => <SessionCard key={s.sessionId} session={s} onCancel={handleCancel} />)}
        </div>
      )}

      {/* Historique */}
      {completed.length > 0 && (
        <div>
          <h2 style={{ color: '#9ca3af', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
            HISTORIQUE ({completed.length})
          </h2>
          {completed.map((s) => <SessionCard key={s.sessionId} session={s} onCancel={handleCancel} />)}
        </div>
      )}

      {sessions.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🖥</div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#9ca3af' }}>Aucune session</p>
          <p style={{ fontSize: '13px' }}>Lance ta première session Computer Use ci-dessus.</p>
        </div>
      )}
    </div>
  );
}
