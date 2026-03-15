'use client';

/**
 * components/HitlCard.tsx — Panneau flottant HITL (Human In The Loop)
 *
 * Affiché en haut à droite quand des demandes d'intervention humaine sont en attente.
 * Affiche la première demande avec :
 *   - Question + contexte mission
 *   - Barre de risque colorée
 *   - Countdown animé vers l'expiration
 *   - Boutons de réponse (oui/non ou options multiples)
 */

import React, { useEffect, useState } from 'react';
import { HitlRequest } from '../store/chimera';

const QUEEN_URL = process.env.NEXT_PUBLIC_QUEEN_URL ?? 'http://localhost:3000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RespondPayload {
  approved: boolean;
  answer?:  string;
}

interface HitlCardProps {
  requests: HitlRequest[];
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function HitlCard({ requests }: HitlCardProps) {
  // N'afficher que si des demandes sont en attente
  if (requests.length === 0) return null;

  const req = requests[0];

  return (
    <div style={floatingPanelStyle}>
      <HitlRequestView req={req} pendingCount={requests.length} />
    </div>
  );
}

// ─── Vue d'une demande HITL ───────────────────────────────────────────────────

function HitlRequestView({ req, pendingCount }: { req: HitlRequest; pendingCount: number }) {
  const [timeLeft, setTimeLeft] = useState<number>(Math.max(0, req.expiresAt - Date.now()));
  const [responding, setResponding] = useState(false);

  // Mise à jour du countdown chaque seconde
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, req.expiresAt - Date.now());
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1_000);
    return () => clearInterval(interval);
  }, [req.expiresAt]);

  // Progression de la barre countdown (1.0 = plein, 0.0 = expiré)
  const progress = req.timeoutMs > 0 ? timeLeft / req.timeoutMs : 0;
  const expired  = timeLeft === 0;

  // Couleur de la barre de risque
  const riskColor =
    req.risk > 0.7 ? '#ef4444' :
    req.risk > 0.4 ? '#f59e0b' :
    '#22c55e';

  async function respond(payload: RespondPayload) {
    if (responding || expired) return;
    setResponding(true);
    try {
      const res = await fetch(`${QUEEN_URL}/api/hitl/${req.requestId}/respond`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(`[HITL] Réponse HTTP ${res.status} pour ${req.requestId}`);
      }
    } catch (err) {
      console.warn('[HITL] Erreur lors de l\'envoi de la réponse :', err);
    } finally {
      setResponding(false);
    }
  }

  // Formatage du temps restant (mm:ss)
  const seconds = Math.floor(timeLeft / 1_000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <>
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🤔</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Action requise
          </span>
        </div>
        <span style={{
          fontSize: '11px', fontFamily: 'monospace', fontWeight: 600,
          color: expired ? '#ef4444' : timeLeft < 10_000 ? '#f87171' : '#9ca3af',
        }}>
          {expired ? 'EXPIRÉ' : `${mm}:${ss}`}
        </span>
      </div>

      {/* Barre countdown */}
      <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '14px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width:  `${Math.round(progress * 100)}%`,
          background: expired ? '#ef4444' : `linear-gradient(90deg, ${riskColor}, #6366f1)`,
          borderRadius: '2px',
          transition: 'width 0.9s linear',
        }} />
      </div>

      {/* Mission ID */}
      <p style={{ fontSize: '10px', color: '#6b7280', margin: '0 0 6px', fontFamily: 'monospace' }}>
        Mission #{req.missionId.slice(-8)}
      </p>

      {/* Question */}
      <p style={{ fontSize: '14px', color: 'white', fontWeight: 600, margin: '0 0 14px', lineHeight: '1.4' }}>
        {req.question}
      </p>

      {/* Barre de risque */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Niveau de risque</span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: riskColor }}>
            {Math.round(req.risk * 100)}%
          </span>
        </div>
        <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width:  `${Math.round(req.risk * 100)}%`,
            background: riskColor,
            borderRadius: '2px',
          }} />
        </div>
      </div>

      {/* Boutons de réponse */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {req.options.length > 0 ? (
          // Options multiples
          req.options.map((option) => (
            <button
              key={option}
              onClick={() => respond({ approved: true, answer: option })}
              disabled={responding || expired}
              style={optionBtnStyle(responding || expired)}
            >
              {option}
            </button>
          ))
        ) : (
          // Oui / Non
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => respond({ approved: true })}
              disabled={responding || expired}
              style={approveBtnStyle(responding || expired)}
            >
              {responding ? '…' : '✅ Approuver'}
            </button>
            <button
              onClick={() => respond({ approved: false })}
              disabled={responding || expired}
              style={rejectBtnStyle(responding || expired)}
            >
              {responding ? '…' : '❌ Refuser'}
            </button>
          </div>
        )}
      </div>

      {/* Autres demandes en attente */}
      {pendingCount > 1 && (
        <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '12px', textAlign: 'center' }}>
          et {pendingCount - 1} autre{pendingCount - 1 > 1 ? 's' : ''} en attente
        </p>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const floatingPanelStyle: React.CSSProperties = {
  position:     'fixed',
  top:          '24px',
  right:        '24px',
  width:        '340px',
  zIndex:       1000,
  background:   '#1f2937',
  border:       '1px solid rgba(99,102,241,0.4)',
  borderRadius: '14px',
  padding:      '18px',
  boxShadow:    '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)',
};

function approveBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex:         1,
    background:   disabled ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.15)',
    border:       '1px solid rgba(34,197,94,0.4)',
    borderRadius: '8px',
    color:        disabled ? '#6b7280' : '#4ade80',
    fontSize:     '13px',
    fontWeight:   600,
    padding:      '10px',
    cursor:       disabled ? 'not-allowed' : 'pointer',
    transition:   'background 0.15s',
  };
}

function rejectBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    flex:         1,
    background:   disabled ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.15)',
    border:       '1px solid rgba(239,68,68,0.4)',
    borderRadius: '8px',
    color:        disabled ? '#6b7280' : '#f87171',
    fontSize:     '13px',
    fontWeight:   600,
    padding:      '10px',
    cursor:       disabled ? 'not-allowed' : 'pointer',
    transition:   'background 0.15s',
  };
}

function optionBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background:   disabled ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.15)',
    border:       '1px solid rgba(99,102,241,0.4)',
    borderRadius: '8px',
    color:        disabled ? '#6b7280' : '#a5b4fc',
    fontSize:     '13px',
    fontWeight:   600,
    padding:      '10px 14px',
    textAlign:    'left',
    cursor:       disabled ? 'not-allowed' : 'pointer',
    transition:   'background 0.15s',
  };
}
