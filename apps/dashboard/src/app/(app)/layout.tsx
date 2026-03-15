'use client';

/**
 * app/(app)/layout.tsx — Layout avec sidebar pour les pages internes Chimera
 *
 * Fournit la navigation latérale commune à :
 *   /chimera  — Dashboard temps réel
 *   /sessions — Sessions Computer Use
 *   /agents   — Statut des agents
 *   /skills   — Marketplace
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChimeraStore } from '../../store/chimera';

const NAV_ITEMS = [
  { href: '/chimera',  icon: '🧠', label: 'Command Center' },
  { href: '/sessions', icon: '🖥', label: 'Computer Use'   },
  { href: '/agents',   icon: '🐝', label: 'Agents'         },
  { href: '/skills',   icon: '🧩', label: 'Skills'         },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const connected = useChimeraStore((s) => s.connected);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117' }}>
      {/* Sidebar */}
      <nav style={{
        width:          collapsed ? '60px' : '200px',
        background:     '#13151f',
        borderRight:    '1px solid rgba(255,255,255,0.07)',
        display:        'flex',
        flexDirection:  'column',
        padding:        '16px 0',
        flexShrink:     0,
        transition:     'width 0.2s ease',
        overflow:       'hidden',
      }}>
        {/* Logo */}
        <div style={{
          display:       'flex',
          alignItems:    'center',
          gap:           '10px',
          padding:       '0 14px 20px',
          borderBottom:  '1px solid rgba(255,255,255,0.07)',
          marginBottom:  '12px',
          whiteSpace:    'nowrap',
        }}>
          <div style={{
            width:          '32px',
            height:         '32px',
            borderRadius:   '8px',
            background:     'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       '16px',
            flexShrink:     0,
          }}>
            🧠
          </div>
          {!collapsed && (
            <div>
              <p style={{ color: 'white', fontWeight: 700, fontSize: '13px', margin: 0 }}>Chimera OS</p>
              <p style={{ color: '#4b5563', fontSize: '10px', margin: 0 }}>
                <span style={{ color: connected ? '#4ade80' : '#f87171' }}>●</span>
                {' '}{connected ? 'En ligne' : 'Hors ligne'}
              </p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1 }}>
          {NAV_ITEMS.map(({ href, icon, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{
                  display:        'flex',
                  alignItems:     'center',
                  gap:            '10px',
                  padding:        '9px 14px',
                  margin:         '1px 8px',
                  borderRadius:   '8px',
                  background:     active ? 'rgba(99,102,241,0.15)' : 'transparent',
                  border:         `1px solid ${active ? 'rgba(99,102,241,0.3)' : 'transparent'}`,
                  cursor:         'pointer',
                  whiteSpace:     'nowrap',
                  transition:     'background 0.15s',
                }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{icon}</span>
                  {!collapsed && (
                    <span style={{
                      color:      active ? '#818cf8' : '#9ca3af',
                      fontWeight: active ? 700 : 500,
                      fontSize:   '13px',
                    }}>
                      {label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background:     'none',
            border:         'none',
            color:          '#4b5563',
            fontSize:       '16px',
            cursor:         'pointer',
            padding:        '8px 14px',
            textAlign:      collapsed ? 'center' : 'right',
          }}
          title={collapsed ? 'Agrandir' : 'Réduire'}
        >
          {collapsed ? '→' : '←'}
        </button>
      </nav>

      {/* Contenu principal */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
