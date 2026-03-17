'use client';

/**
 * app/(app)/settings/page.tsx — Paramètres Chimera OS
 *
 * Configuration générale : API keys, ports, WebSocket, modèle IA,
 * notifications, danger zone.
 */

import React, { useState } from 'react';
import { useChimeraStore } from '../../../store/chimera';

// ─── Composant Section ────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      background:   '#1a1d27',
      border:       '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding:      '18px',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <h3 style={{ color: 'white', fontSize: '14px', fontWeight: 700, margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', placeholder, masked,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; masked?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          type={masked && !show ? 'password' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px', color: 'white', fontSize: '13px', padding: '9px 12px', outline: 'none',
            fontFamily: masked ? 'monospace' : 'inherit',
          }}
        />
        {masked && (
          <button
            onClick={() => setShow(!show)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#9ca3af', fontSize: '12px', padding: '0 12px', cursor: 'pointer',
            }}
          >
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <p style={{ color: 'white', fontSize: '13px', fontWeight: 500, margin: 0 }}>{label}</p>
        {description && <p style={{ color: '#6b7280', fontSize: '11px', margin: '2px 0 0' }}>{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: '40px', height: '22px', borderRadius: '999px', border: 'none',
          background: value ? '#6366f1' : 'rgba(255,255,255,0.12)',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: '3px', left: value ? '21px' : '3px',
          width: '16px', height: '16px', borderRadius: '50%', background: 'white',
          transition: 'left 0.2s',
        }} />
      </button>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const connected = useChimeraStore((s) => s.connected);

  // État local des settings (idéalement persisté dans localStorage ou API)
  const [apiKey,    setApiKey]    = useState('sk-ant-••••••••••••••••••••');
  const [queenPort, setQueenPort] = useState('3000');
  const [wsPort,    setWsPort]    = useState('9002');
  const [dashPort,  setDashPort]  = useState('3001');
  const [model,     setModel]     = useState('claude-opus-4-6');
  const [maxTurns,  setMaxTurns]  = useState('8');

  const [hitlEnabled,    setHitlEnabled]    = useState(true);
  const [autoHibernate,  setAutoHibernate]  = useState(true);
  const [memoryEnabled,  setMemoryEnabled]  = useState(true);
  const [telemetry,      setTelemetry]      = useState(false);
  const [darkLogs,       setDarkLogs]       = useState(true);

  const [saved, setSaved] = useState(false);

  function handleSave() {
    // TODO: appel API Queen /config
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{
      minHeight:  '100vh',
      background: '#0f1117',
      padding:    '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth:   '760px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #374151, #6b7280)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
          }}>⚙️</div>
          <div>
            <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 700, margin: 0 }}>Paramètres</h1>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '2px 0 0' }}>Configuration de Chimera OS</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {saved && (
            <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: 600 }}>✓ Sauvegardé</span>
          )}
          <button
            onClick={handleSave}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: '8px', color: 'white',
              fontWeight: 700, fontSize: '13px', padding: '9px 20px', cursor: 'pointer',
            }}
          >
            Sauvegarder
          </button>
        </div>
      </div>

      {/* Section : API & Modèle */}
      <Section title="API Anthropic & Modèle" icon="🤖">
        <Field label="Clé API Anthropic" value={apiKey} onChange={setApiKey} placeholder="sk-ant-..." masked />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: '#9ca3af', fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Modèle IA
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px', color: 'white', fontSize: '13px', padding: '9px 12px', outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="claude-opus-4-6">claude-opus-4-6 (Recommandé)</option>
              <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
              <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
            </select>
          </div>
          <Field label="Tours max (Architecte)" value={maxTurns} onChange={setMaxTurns} type="number" placeholder="8" />
        </div>
      </Section>

      {/* Section : Ports */}
      <Section title="Ports & Réseau" icon="🔌">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <Field label="Queen Node.js" value={queenPort} onChange={setQueenPort} type="number" placeholder="3000" />
          <Field label="WebSocket" value={wsPort} onChange={setWsPort} type="number" placeholder="9002" />
          <Field label="Dashboard Next.js" value={dashPort} onChange={setDashPort} type="number" placeholder="3001" />
        </div>
        <div style={{
          background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: '8px', padding: '10px 12px',
        }}>
          <p style={{ fontSize: '12px', color: '#818cf8', margin: 0 }}>
            💡 Les agents Python utilisent les ports <span style={{ fontFamily: 'monospace' }}>8001–8010</span>.
            Modifier les ports nécessite un redémarrage complet via <span style={{ fontFamily: 'monospace' }}>make dev</span>.
          </p>
        </div>
      </Section>

      {/* Section : Comportement agents */}
      <Section title="Comportement des agents" icon="🐝">
        <Toggle
          label="HITL (Human-in-the-loop)"
          description="L'Architecte demande confirmation avant les actions critiques"
          value={hitlEnabled}
          onChange={setHitlEnabled}
        />
        <Toggle
          label="Hibernation automatique"
          description="Les agents de niveau 1 s'hibernent après 300s d'inactivité"
          value={autoHibernate}
          onChange={setAutoHibernate}
        />
        <Toggle
          label="Mémoire épisodique"
          description="Clio mémorise les épisodes importants de chaque mission"
          value={memoryEnabled}
          onChange={setMemoryEnabled}
        />
        <Toggle
          label="Logs en mode sombre (terminal)"
          description="Interface de logs style terminal monospace"
          value={darkLogs}
          onChange={setDarkLogs}
        />
        <div style={{ paddingTop: '4px' }}>
          <Toggle
            label="Télémétrie anonyme"
            description="Envoie des métriques d'usage anonymisées pour améliorer Chimera"
            value={telemetry}
            onChange={setTelemetry}
          />
        </div>
      </Section>

      {/* Section : Version */}
      <Section title="Informations système" icon="ℹ️">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[
            { label: 'Version Chimera', value: '6.0.0' },
            { label: 'Node.js Queen',   value: 'v20.x' },
            { label: 'Python agents',   value: '3.12.x' },
            { label: 'Dashboard',       value: 'Next.js 14' },
            { label: 'Tests Python',    value: '346 ✓' },
            { label: 'Statut WS',       value: connected ? '● Connecté' : '○ Déconnecté' },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px', padding: '10px 12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>{label}</span>
              <span style={{
                fontSize: '12px', fontFamily: 'monospace', fontWeight: 600,
                color: label === 'Statut WS' ? (connected ? '#4ade80' : '#f87171') : '#9ca3af',
              }}>{value}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Section : Danger Zone */}
      <div style={{
        background:   'rgba(248,113,113,0.05)',
        border:       '1px solid rgba(248,113,113,0.2)',
        borderRadius: '12px',
        padding:      '18px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <h3 style={{ color: '#f87171', fontSize: '14px', fontWeight: 700, margin: 0 }}>Zone dangereuse</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { label: 'Redémarrer tous les agents Python', desc: 'Interrompt toutes les missions en cours' },
            { label: 'Vider la mémoire épisodique',       desc: 'Supprime définitivement tous les épisodes mémorisés' },
            { label: 'Réinitialiser le registre de skills', desc: 'Supprime tous les skills appris' },
          ].map(({ label, desc }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: 'rgba(248,113,113,0.06)',
              border: '1px solid rgba(248,113,113,0.15)', borderRadius: '8px',
            }}>
              <div>
                <p style={{ color: 'white', fontSize: '13px', fontWeight: 500, margin: 0 }}>{label}</p>
                <p style={{ color: '#9ca3af', fontSize: '11px', margin: '2px 0 0' }}>{desc}</p>
              </div>
              <button style={{
                background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: '7px', color: '#f87171', fontSize: '12px', fontWeight: 600,
                padding: '7px 16px', cursor: 'pointer',
              }}>
                Exécuter
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
