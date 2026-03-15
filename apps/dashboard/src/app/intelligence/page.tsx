'use client';

import React, { useState } from 'react';

/* ── Product Intelligence Data ── */
const features = [
    { name: 'API Integrations', conversionImpact: 3.8, demos: 45, avgEngagement: 92, confusionRate: 5, trend: 'up', topPerformer: 'Sarah J.' },
    { name: 'Real-time Dashboard', conversionImpact: 2.4, demos: 38, avgEngagement: 78, confusionRate: 12, trend: 'up', topPerformer: 'Mike T.' },
    { name: 'SSO / Security', conversionImpact: 2.0, demos: 28, avgEngagement: 88, confusionRate: 8, trend: 'stable', topPerformer: 'Sarah J.' },
    { name: 'Workflow Automation', conversionImpact: 1.6, demos: 22, avgEngagement: 65, confusionRate: 22, trend: 'down', topPerformer: 'Jessica L.' },
    { name: 'Custom Reports', conversionImpact: 1.1, demos: 32, avgEngagement: 45, confusionRate: 28, trend: 'down', topPerformer: 'David C.' },
    { name: 'Team Collaboration', conversionImpact: 1.8, demos: 18, avgEngagement: 72, confusionRate: 15, trend: 'up', topPerformer: 'Mike T.' },
];

const slideAnalysis = [
    { slide: 'Problem Statement', avgAttention: 88, dropOff: 2, bestPractice: 'Lead with specific pain point data' },
    { slide: 'Product Overview', avgAttention: 75, dropOff: 8, bestPractice: 'Keep under 2 minutes' },
    { slide: 'API Demo', avgAttention: 94, dropOff: 1, bestPractice: 'Show live integration — highest engagement' },
    { slide: 'Pricing', avgAttention: 92, dropOff: 5, bestPractice: 'Follow with ROI calculator immediately' },
    { slide: 'Security/Compliance', avgAttention: 68, dropOff: 15, bestPractice: 'Show certifications early, skip deep dive unless asked' },
    { slide: 'Roadmap', avgAttention: 52, dropOff: 22, bestPractice: 'Only show for Enterprise — prospects lose interest otherwise' },
];

export default function ProductIntelligencePage() {
    const [view, setView] = useState<'features' | 'slides'>('features');

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-neutral-50)' }}>
            <header style={{
                background: 'white', borderBottom: '1px solid var(--color-neutral-200)',
                padding: 'var(--space-5) var(--space-8)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-lg)', background: 'var(--gradient-brand)', boxShadow: 'var(--shadow-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'var(--font-extrabold)', fontSize: '14px' }}>R</div>
                    <div>
                        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-display)' }}>
                            🧠 Product Intelligence
                        </h1>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-400)' }}>Revenue OS · Feature Conversion Impact Analysis</p>
                    </div>
                </div>
            </header>

            <main style={{ padding: 'var(--space-8)', maxWidth: '1300px', margin: '0 auto' }}>
                {/* Summary KPIs */}
                <div className="grid-kpi animate-fade-in" style={{ marginBottom: 'var(--space-6)', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    {[
                        { icon: '🎯', label: 'Top Converting Feature', value: 'API Integrations', sub: '3.8× impact' },
                        { icon: '📉', label: 'Highest Confusion', value: 'Custom Reports', sub: '28% confusion rate' },
                        { icon: '⏱️', label: 'Optimal Demo Length', value: '28 min', sub: 'For winning demos' },
                        { icon: '📊', label: 'Features Analyzed', value: '6', sub: 'Across 183 demos' },
                    ].map((k) => (
                        <div key={k.label} className="card" style={{ padding: 'var(--space-5)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                                <span>{k.icon}</span>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)', fontWeight: 'var(--font-medium)' }}>{k.label}</span>
                            </div>
                            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }}>{k.value}</p>
                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent-600)', fontWeight: 'var(--font-semibold)' }}>{k.sub}</p>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
                    {[
                        { id: 'features' as const, label: '📊 Feature Impact Matrix' },
                        { id: 'slides' as const, label: '📑 Slide-by-Slide Analysis' },
                    ].map((tab) => (
                        <button key={tab.id}
                            onClick={() => setView(tab.id)}
                            style={{
                                padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-lg)',
                                border: view === tab.id ? '2px solid var(--color-primary-500)' : '1px solid var(--color-neutral-200)',
                                background: view === tab.id ? 'var(--color-primary-50)' : 'white',
                                color: view === tab.id ? 'var(--color-primary-700)' : 'var(--color-neutral-600)',
                                fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', cursor: 'pointer',
                            }}>{tab.label}</button>
                    ))}
                </div>

                {view === 'features' && (
                    <div className="card animate-fade-in">
                        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-5)' }}>
                            Feature Conversion Impact Matrix
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(5, 1fr) 0.8fr', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-neutral-500)' }}>
                            <span>Feature</span><span>Impact ×</span><span>Demos</span><span>Engagement</span><span>Confusion</span><span>Trend</span><span>Top Rep</span>
                        </div>
                        {features.sort((a, b) => b.conversionImpact - a.conversionImpact).map((f) => (
                            <div key={f.name} style={{ display: 'grid', gridTemplateColumns: '1.5fr repeat(5, 1fr) 0.8fr', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-3)', borderBottom: '1px solid var(--color-neutral-100)', alignItems: 'center', fontSize: 'var(--text-sm)' }}>
                                <span style={{ fontWeight: 'var(--font-semibold)' }}>{f.name}</span>
                                <span style={{
                                    fontWeight: 'var(--font-extrabold)', textAlign: 'center',
                                    color: f.conversionImpact >= 2 ? 'var(--color-accent-600)' : 'var(--color-neutral-500)',
                                    background: f.conversionImpact >= 2 ? 'var(--color-accent-50)' : 'transparent',
                                    padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                                }}>{f.conversionImpact}×</span>
                                <span style={{ color: 'var(--color-neutral-500)' }}>{f.demos}</span>
                                <div>
                                    <div style={{ height: '4px', background: 'var(--color-neutral-200)', borderRadius: 'var(--radius-full)', marginBottom: '2px' }}>
                                        <div style={{ height: '100%', width: `${f.avgEngagement}%`, background: f.avgEngagement >= 80 ? 'var(--color-accent-500)' : f.avgEngagement >= 60 ? 'var(--color-primary-400)' : 'var(--color-warning)', borderRadius: 'var(--radius-full)' }} />
                                    </div>
                                    <span style={{ fontSize: '10px', color: 'var(--color-neutral-500)' }}>{f.avgEngagement}%</span>
                                </div>
                                <span style={{ color: f.confusionRate >= 20 ? 'var(--color-error)' : f.confusionRate >= 10 ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 'var(--font-bold)' }}>
                                    {f.confusionRate}%
                                </span>
                                <span>{f.trend === 'up' ? '📈' : f.trend === 'down' ? '📉' : '➡️'}</span>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)' }}>{f.topPerformer}</span>
                            </div>
                        ))}
                        <div style={{ marginTop: 'var(--space-5)', padding: 'var(--space-4)', background: 'var(--color-primary-50)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-primary-100)' }}>
                            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-700)' }}>
                                💡 Action: "Workflow Automation" has 22% confusion. Review demo script — Sarah J. achieves 1.9× with modified walkthrough.
                            </p>
                        </div>
                    </div>
                )}

                {view === 'slides' && (
                    <div className="card animate-fade-in">
                        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-5)' }}>
                            Slide-by-Slide Attention Analysis
                        </h3>
                        {slideAnalysis.map((s, i) => (
                            <div key={s.slide} style={{
                                display: 'flex', alignItems: 'center', gap: 'var(--space-5)',
                                padding: 'var(--space-4)',
                                borderBottom: '1px solid var(--color-neutral-100)',
                                background: s.dropOff >= 15 ? 'var(--color-error-light)' : 'transparent',
                                borderLeft: s.avgAttention >= 90 ? '3px solid var(--color-accent-500)' : s.dropOff >= 15 ? '3px solid var(--color-error)' : 'none',
                            }}>
                                <span style={{ width: '30px', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-neutral-300)' }}>{i + 1}</span>
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', marginBottom: '4px' }}>{s.slide}</p>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)' }}>💡 {s.bestPractice}</p>
                                </div>
                                <div style={{ textAlign: 'center', minWidth: '80px' }}>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)' }}>Attention</p>
                                    <p style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: s.avgAttention >= 80 ? 'var(--color-accent-600)' : 'var(--color-warning-dark)' }}>
                                        {s.avgAttention}%
                                    </p>
                                </div>
                                <div style={{ textAlign: 'center', minWidth: '80px' }}>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)' }}>Drop-off</p>
                                    <p style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: s.dropOff >= 15 ? 'var(--color-error)' : s.dropOff >= 8 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                                        -{s.dropOff}%
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
