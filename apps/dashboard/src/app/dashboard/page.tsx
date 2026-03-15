'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const quickActions = [
  { icon: '🎥', label: 'Start Demo', href: '/demos', description: 'Launch your next demo session' },
  { icon: '📊', label: 'Revenue Pipeline', href: '/pipeline', description: 'View and manage your pipeline' },
  { icon: '🧠', label: 'Product Intel', href: '/intelligence', description: 'AI-powered product insights' },
  { icon: '📋', label: 'Playbooks', href: '/playbooks', description: 'Access closing playbooks' },
  { icon: '🎮', label: 'Simulator', href: '/training', description: 'Practice with AI prospect' },
  { icon: '📚', label: 'Knowledge Base', href: '/knowledge', description: 'Search docs and guides' },
];

export default function DashboardPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', background: '#0f0f1a',
        color: 'rgba(255,255,255,0.4)', fontSize: '14px',
      }}>
        Loading...
      </div>
    );
  }

  const firstName = user.firstName || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'Closer';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
      padding: '48px 64px',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    }}>
      {/* En-tête de bienvenue */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '999px', padding: '6px 14px', marginBottom: '16px',
        }}>
          <span style={{ fontSize: '12px', color: 'rgba(165,180,252,0.9)', fontWeight: 600, letterSpacing: '0.06em' }}>
            REVENUE OS — INTELLIGENCE PLATFORM
          </span>
        </div>

        <h1 style={{
          fontSize: '42px', fontWeight: 800, color: 'white',
          lineHeight: 1.15, marginBottom: '12px',
        }}>
          Bienvenue,{' '}
          <span style={{
            background: 'linear-gradient(90deg, #818cf8, #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            {firstName}
          </span>{' '}
          👋
        </h1>

        <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.5)', maxWidth: '520px', lineHeight: 1.6 }}>
          Ton Revenue Command Center est prêt. Choisis une action rapide pour commencer ta session.
        </p>
      </div>

      {/* Actions rapides */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{
          fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.35)',
          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px',
        }}>
          Actions rapides
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '16px',
        }}>
          {quickActions.map((action) => (
            <a
              key={action.href}
              href={action.href}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '16px',
                padding: '20px 24px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                textDecoration: 'none',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(99,102,241,0.12)';
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(99,102,241,0.35)';
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)';
                (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.08)';
                (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
              }}
            >
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: 'rgba(99,102,241,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', flexShrink: 0,
              }}>
                {action.icon}
              </div>
              <div>
                <p style={{ color: 'white', fontWeight: 600, fontSize: '15px', marginBottom: '4px' }}>
                  {action.label}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', lineHeight: 1.4 }}>
                  {action.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Lien vers le Command Center complet */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '16px',
        padding: '20px 24px',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(167,139,250,0.1))',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: '16px',
        maxWidth: '600px',
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '22px', flexShrink: 0,
        }}>
          🚀
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ color: 'white', fontWeight: 600, fontSize: '15px', marginBottom: '2px' }}>
            Revenue Command Center complet
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px' }}>
            KPIs temps réel, funnel, démos à venir et intelligence IA
          </p>
        </div>
        <a href="/" style={{
          color: '#818cf8', fontWeight: 600, fontSize: '14px',
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          Ouvrir →
        </a>
      </div>
    </div>
  );
}
