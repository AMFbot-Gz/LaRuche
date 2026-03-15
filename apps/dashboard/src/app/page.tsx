'use client';

import React, { useState } from 'react';
import { KpiCard, AiInsightPanel } from '@saas/ui-kit';
import type { NavItem, AiInsight } from '@saas/ui-kit';

/* ── Revenue OS Navigation ── */
const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', href: '/', icon: <span>📊</span> },
    { id: 'demos', label: 'Demo Pipeline', href: '/demos', icon: <span>🎥</span>, badge: 3 },
    { id: 'intelligence', label: 'Product Intel', href: '/intelligence', icon: <span>🧠</span> },
    { id: 'pipeline', label: 'Revenue Pipeline', href: '/pipeline', icon: <span>💰</span> },
    { id: 'playbooks', label: 'Playbooks', href: '/playbooks', icon: <span>📋</span> },
    { id: 'training', label: 'Simulator', href: '/training', icon: <span>🎮</span> },
    { id: 'knowledge', label: 'Knowledge Base', href: '/knowledge', icon: <span>📚</span> },
];

const insights: AiInsight[] = [
    {
        id: '1',
        priority: 'high',
        title: 'Pricing objection pattern detected on',
        highlightedEntity: 'Enterprise tier demos',
        description: '4 of last 6 demos stalled at pricing. Revenue at risk: $240k ARR. Deploy "ROI Calculator" playbook.',
        timeAgo: '12m ago',
        action: { label: 'View Analysis' },
    },
    {
        id: '2',
        priority: 'trend',
        title: 'Feature "API Integrations" drives 3.2x conversion',
        description: 'Demos that showcase API integrations convert at 68% vs 21% average. Recommend prioritizing in demo flow.',
        timeAgo: '1h ago',
        action: { label: 'Update Playbook' },
    },
    {
        id: '3',
        priority: 'medium',
        title: 'Churn risk alert:',
        highlightedEntity: 'TechFlow Inc.',
        description: 'Renewal call sentiment dropped 34%. Low product engagement last 30 days. Schedule proactive check-in.',
        timeAgo: '3h ago',
        action: { label: 'View Risk Profile' },
    },
];

const upcomingDemos = [
    { id: '1', time: '10:00', title: 'Product Demo: Acme Corp', contact: 'Sarah Jenkins, VP Sales', tta: 'Enterprise', tier: '$120k ARR', canJoin: true },
    { id: '2', time: '1:30 PM', title: 'Discovery Call: TechFlow', contact: 'Mike Chen, CTO', tta: 'Mid-Market', tier: '$45k ARR', tag: 'Discovery' },
    { id: '3', time: '3:00 PM', title: 'Renewal Review: Starlight', contact: 'Lisa Park, COO', tta: 'Growth', tier: '$28k ARR', tag: 'Renewal' },
];

const revenueFunnel = [
    { stage: 'Demos Scheduled', count: 24, value: '$1.2M', pct: 100, color: 'var(--color-primary-500)' },
    { stage: 'Qualified', count: 18, value: '$920k', pct: 75, color: 'var(--color-primary-400)' },
    { stage: 'Proposal Sent', count: 12, value: '$680k', pct: 50, color: 'var(--color-accent-500)' },
    { stage: 'Negotiation', count: 8, value: '$440k', pct: 33, color: 'var(--color-accent-400)' },
    { stage: 'Closed Won', count: 5, value: '$280k', pct: 21, color: 'var(--color-success)' },
];

export default function CloserDashboard() {
    const [activeNav, setActiveNav] = useState('dashboard');

    return (
        <div className="app-layout">
            {/* Sidebar */}
            <nav style={{
                width: '240px', minHeight: '100vh',
                background: 'var(--gradient-sidebar)',
                display: 'flex', flexDirection: 'column',
                padding: 'var(--space-4) 0',
            }}>
                {/* Brand */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    padding: '0 var(--space-5)', marginBottom: 'var(--space-8)',
                }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: 'var(--radius-lg)',
                        background: 'var(--gradient-brand)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 'var(--font-extrabold)', fontSize: '16px',
                        boxShadow: 'var(--shadow-glow)',
                    }}>R</div>
                    <div>
                        <span style={{ color: 'white', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)' }}>
                            Revenue OS
                        </span>
                        <p style={{ fontSize: '10px', color: 'var(--color-accent-400)', letterSpacing: '0.08em' }}>
                            INTELLIGENCE PLATFORM
                        </p>
                    </div>
                </div>

                {/* Nav Items */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 var(--space-3)' }}>
                    {navItems.map((item) => {
                        const isActive = item.id === activeNav;
                        return (
                            <a key={item.id} href={item.href}
                                onClick={(e) => { e.preventDefault(); setActiveNav(item.id); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                                    padding: 'var(--space-3) var(--space-4)',
                                    borderRadius: 'var(--radius-lg)',
                                    fontSize: 'var(--text-sm)',
                                    fontWeight: isActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                                    color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                                    background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    textDecoration: 'none', transition: 'var(--transition-fast)', cursor: 'pointer',
                                }}
                            >
                                {item.icon && <span style={{ display: 'flex', width: '20px', justifyContent: 'center' }}>{item.icon}</span>}
                                <span style={{ flex: 1 }}>{item.label}</span>
                                {item.badge !== undefined && item.badge > 0 && (
                                    <span style={{
                                        background: 'var(--color-accent-500)', color: 'white',
                                        fontSize: '10px', fontWeight: 'var(--font-bold)',
                                        padding: '1px 6px', borderRadius: 'var(--radius-full)',
                                    }}>{item.badge}</span>
                                )}
                            </a>
                        );
                    })}
                </div>

                {/* User */}
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    padding: 'var(--space-4) var(--space-5)', marginTop: 'var(--space-2)',
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: 'var(--radius-full)',
                        background: 'var(--gradient-brand)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)',
                    }}>AC</div>
                    <div>
                        <p style={{ color: 'white', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>Alex Closer</p>
                        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>Senior AE • Growth Plan</p>
                    </div>
                </div>
            </nav>

            {/* Main content */}
            <div className="app-main">
                <header className="app-header">
                    <div>
                        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>Revenue Command Center</h1>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-400)' }}>October 4, 2024 • Q4 Sprint</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                        <div style={{
                            background: 'var(--color-neutral-100)', borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-2) var(--space-4)',
                            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                            color: 'var(--color-neutral-400)', fontSize: 'var(--text-sm)', width: '260px',
                        }}>
                            🔍 Search deals, prospects, insights...
                        </div>
                        <button style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>
                            🔔
                            <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '8px', height: '8px', background: 'var(--color-accent-500)', borderRadius: 'var(--radius-full)', border: '2px solid white' }} />
                        </button>
                    </div>
                </header>

                <div className="app-content" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-6)' }}>
                    {/* Left column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                        {/* KPI Row */}
                        <div className="grid-kpi animate-fade-in" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            <KpiCard icon={<span>🎯</span>} label="Demo Pipeline" value="$1.2M" trend={{ value: '+18% MoM', direction: 'up' }} />
                            <KpiCard icon={<span>📈</span>} label="Demo→Close Rate" value="34%" trend={{ value: '+2.1% vs Q3', direction: 'up' }} />
                            <KpiCard icon={<span>💰</span>} label="Forecasted MRR" value="$84.2k" trend={{ value: '+$12k pipeline', direction: 'up' }} />
                            <KpiCard icon={<span>⚡</span>} label="Avg Demo Score" value="8.4" trend={{ value: 'Top 15%', direction: 'up', label: '/10' }} />
                        </div>

                        {/* Revenue Funnel */}
                        <div className="card animate-fade-in" style={{ animationDelay: '0.1s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
                                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>Revenue Funnel</h3>
                                <span className="badge badge-accent">Live</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                {revenueFunnel.map((s, i) => (
                                    <div key={s.stage} className="funnel-stage" style={{
                                        display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
                                        padding: 'var(--space-3) var(--space-4)',
                                        borderRadius: 'var(--radius-lg)',
                                        background: i === 0 ? 'var(--color-primary-50)' : 'transparent',
                                    }}>
                                        <div style={{ width: '120px', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-neutral-700)' }}>
                                            {s.stage}
                                        </div>
                                        <div style={{ flex: 1, height: '24px', background: 'var(--color-neutral-100)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                                            <div style={{
                                                width: `${s.pct}%`, height: '100%',
                                                background: s.color, borderRadius: 'var(--radius-full)',
                                                transition: 'width 0.8s ease',
                                                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                                                paddingRight: 'var(--space-3)',
                                            }}>
                                                <span style={{ fontSize: '10px', color: 'white', fontWeight: 'var(--font-bold)' }}>{s.count}</span>
                                            </div>
                                        </div>
                                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-neutral-800)', minWidth: '70px', textAlign: 'right' }}>
                                            {s.value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Upcoming Demos */}
                        <div className="card animate-fade-in" style={{ animationDelay: '0.2s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
                                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>Upcoming Demos</h3>
                                <a href="#" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-500)' }}>View All Demos</a>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                {upcomingDemos.map((d, i) => (
                                    <div key={d.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
                                        padding: 'var(--space-4)',
                                        borderRadius: 'var(--radius-lg)',
                                        background: i === 0 ? 'var(--color-primary-50)' : 'transparent',
                                        borderLeft: i === 0 ? '3px solid var(--color-primary-500)' : 'none',
                                    }}>
                                        <div style={{ minWidth: '60px', textAlign: 'center' }}>
                                            <p style={{
                                                fontSize: i === 0 ? 'var(--text-xl)' : 'var(--text-lg)',
                                                fontWeight: 'var(--font-bold)',
                                                color: i === 0 ? 'var(--color-primary-500)' : 'var(--color-neutral-700)',
                                            }}>{d.time}</p>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>{d.title}</p>
                                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)', marginTop: '2px' }}>
                                                {d.contact}
                                            </p>
                                            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: '4px' }}>
                                                <span className="badge badge-primary">{d.tta}</span>
                                                <span className="badge badge-revenue">{d.tier}</span>
                                            </div>
                                        </div>
                                        {d.canJoin ? (
                                            <button className="btn btn-primary" style={{ gap: 'var(--space-2)' }}>▶ Start Demo</button>
                                        ) : d.tag ? (
                                            <span className={`badge ${d.tag === 'Renewal' ? 'badge-warning' : 'badge-info'}`}>{d.tag}</span>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                        <div className="animate-slide-in">
                            <AiInsightPanel title="Revenue Intelligence" insights={insights} />
                        </div>

                        {/* Feature Conversion Impact Mini */}
                        <div className="card card-brand animate-slide-in" style={{ animationDelay: '0.1s' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
                                <span>🧠</span>
                                <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)' }}>Feature Conversion Impact</h3>
                            </div>
                            {[
                                { feature: 'API Integrations', impact: '+3.2x', bar: 90, color: 'var(--color-accent-500)' },
                                { feature: 'Real-time Dashboard', impact: '+2.1x', bar: 65, color: 'var(--color-primary-500)' },
                                { feature: 'Custom Reports', impact: '+1.4x', bar: 40, color: 'var(--color-primary-300)' },
                                { feature: 'SSO/Security', impact: '+1.1x', bar: 25, color: 'var(--color-neutral-300)' },
                            ].map((f) => (
                                <div key={f.feature} style={{ marginBottom: 'var(--space-3)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>{f.feature}</span>
                                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-accent-600)' }}>{f.impact}</span>
                                    </div>
                                    <div style={{ height: '4px', background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-full)' }}>
                                        <div style={{ height: '100%', width: `${f.bar}%`, background: f.color, borderRadius: 'var(--radius-full)', transition: 'width 0.6s ease' }} />
                                    </div>
                                </div>
                            ))}
                            <a href="#" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-500)', fontWeight: 'var(--font-semibold)', display: 'block', marginTop: 'var(--space-3)' }}>
                                View Full Product Intelligence →
                            </a>
                        </div>

                        {/* Churn Risk Mini */}
                        <div className="card animate-slide-in" style={{ animationDelay: '0.2s' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <span>🔮</span>
                                    <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)' }}>Churn Risk Alerts</h3>
                                </div>
                                <span className="badge badge-error">3 at risk</span>
                            </div>
                            {[
                                { name: 'TechFlow Inc.', risk: 'High', score: 78, mrr: '$3.2k', color: 'var(--color-churn-high)' },
                                { name: 'DataSync Co.', risk: 'Medium', score: 52, mrr: '$1.8k', color: 'var(--color-churn-medium)' },
                                { name: 'CloudOne', risk: 'Medium', score: 45, mrr: '$5.4k', color: 'var(--color-churn-medium)' },
                            ].map((c) => (
                                <div key={c.name} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: 'var(--space-3)',
                                    borderLeft: `3px solid ${c.color}`,
                                    borderRadius: 'var(--radius-sm)',
                                    marginBottom: 'var(--space-2)',
                                    background: 'var(--color-neutral-50)',
                                }}>
                                    <div>
                                        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>{c.name}</p>
                                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)' }}>{c.mrr} MRR</p>
                                    </div>
                                    <span style={{
                                        fontSize: '10px', fontWeight: 'var(--font-bold)',
                                        color: c.color, background: `${c.color}15`,
                                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                    }}>
                                        {c.score}% risk
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
