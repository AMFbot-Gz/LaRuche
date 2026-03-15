'use client';

import React, { useState } from 'react';

/* ── Simulation Personas ── */
const personas = [
    {
        id: 'mid-market',
        icon: '🏢',
        label: 'Mid-Market VP Sales',
        description: 'Company: 50-200 employees, evaluating 3 vendors, focused on ROI and time-to-value.',
        difficulty: 'Medium',
        objections: ['Budget allocation', 'Implementation timeline', 'Team adoption'],
        color: 'var(--color-primary-500)',
    },
    {
        id: 'enterprise',
        icon: '🏛️',
        label: 'Enterprise CTO',
        description: 'Company: 1000+ employees, strict security/compliance requirements, long procurement cycle.',
        difficulty: 'Hard',
        objections: ['Security & compliance', 'Data residency', 'Enterprise SLA', 'Integration complexity'],
        color: 'var(--color-revenue-500)',
    },
    {
        id: 'technical',
        icon: '👨‍💻',
        label: 'Technical Lead',
        description: 'Evaluating API capabilities, scalability, and dev experience. Wants proof not marketing.',
        difficulty: 'Hard',
        objections: ['API limitations', 'Documentation quality', 'Performance benchmarks'],
        color: 'var(--color-accent-500)',
    },
    {
        id: 'cfo',
        icon: '💼',
        label: 'CFO / Finance',
        description: 'Budget-focused, needs clear ROI model, prefers annual contracts with payment flexibility.',
        difficulty: 'Expert',
        objections: ['Total cost of ownership', 'ROI justification', 'Contract terms', 'Hidden fees'],
        color: 'var(--color-error)',
    },
];

const recentSessions = [
    { persona: 'Mid-Market VP Sales', score: 8.2, date: 'Oct 3', objections: 3, handled: 3, time: '22 min' },
    { persona: 'Enterprise CTO', score: 6.8, date: 'Oct 2', objections: 5, handled: 3, time: '34 min' },
    { persona: 'Technical Lead', score: 7.5, date: 'Oct 1', objections: 4, handled: 3, time: '28 min' },
];

export default function SimulatorPage() {
    const [selectedPersona, setSelectedPersona] = useState<string | null>(null);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-neutral-50)' }}>
            {/* Header */}
            <header style={{
                background: 'white', borderBottom: '1px solid var(--color-neutral-200)',
                padding: 'var(--space-5) var(--space-8)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-lg)', background: 'var(--gradient-brand)', boxShadow: 'var(--shadow-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'var(--font-extrabold)', fontSize: '14px' }}>R</div>
                    <div>
                        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-display)' }}>
                            🎮 Demo Simulator
                        </h1>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-400)' }}>Revenue OS · Train with AI-powered SaaS prospects</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <button className="btn btn-secondary">📊 My Stats</button>
                    <button className="btn btn-primary">🎯 Quick Practice</button>
                </div>
            </header>

            <main style={{ padding: 'var(--space-8)', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Persona Selection */}
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-5)' }}>Choose Your Prospect Persona</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-5)', marginBottom: 'var(--space-8)' }}>
                    {personas.map((p) => {
                        const isSelected = selectedPersona === p.id;
                        return (
                            <div key={p.id}
                                onClick={() => setSelectedPersona(p.id)}
                                className="card"
                                style={{
                                    cursor: 'pointer',
                                    borderLeft: `4px solid ${p.color}`,
                                    border: isSelected ? `2px solid ${p.color}` : undefined,
                                    boxShadow: isSelected ? `0 0 20px ${p.color}20` : undefined,
                                    transition: 'var(--transition-normal)',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                                    <span style={{ fontSize: 'var(--text-3xl)' }}>{p.icon}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                                            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>{p.label}</h3>
                                            <span style={{
                                                fontSize: '10px', fontWeight: 'var(--font-bold)',
                                                color: p.difficulty === 'Expert' ? 'var(--color-error)' : p.difficulty === 'Hard' ? 'var(--color-warning-dark)' : 'var(--color-accent-600)',
                                                background: p.difficulty === 'Expert' ? 'var(--color-error-light)' : p.difficulty === 'Hard' ? 'var(--color-warning-light)' : 'var(--color-accent-50)',
                                                padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                            }}>{p.difficulty}</span>
                                        </div>
                                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-neutral-500)', marginBottom: 'var(--space-3)', lineHeight: 'var(--leading-relaxed)' }}>{p.description}</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                                            {p.objections.map((o) => (
                                                <span key={o} className="badge badge-info" style={{ fontSize: '10px' }}>{o}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {selectedPersona && (
                    <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
                        <button className="btn btn-revenue" style={{ padding: 'var(--space-4) var(--space-10)', fontSize: 'var(--text-lg)', borderRadius: 'var(--radius-xl)' }}>
                            🚀 Start Simulation
                        </button>
                    </div>
                )}

                {/* Recent Sessions */}
                <div className="card">
                    <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-5)' }}>Recent Training Sessions</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(4, 1fr) 0.8fr', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--color-neutral-50)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-neutral-500)' }}>
                        <span>Persona</span><span>Score</span><span>Objections</span><span>Handled</span><span>Duration</span><span>Date</span>
                    </div>
                    {recentSessions.map((s, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr repeat(4, 1fr) 0.8fr', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-3)', borderBottom: '1px solid var(--color-neutral-100)', alignItems: 'center', fontSize: 'var(--text-sm)' }}>
                            <span style={{ fontWeight: 'var(--font-semibold)' }}>{s.persona}</span>
                            <span style={{ fontWeight: 'var(--font-bold)', color: s.score >= 8 ? 'var(--color-success)' : s.score >= 7 ? 'var(--color-primary-500)' : 'var(--color-warning)' }}>{s.score}/10</span>
                            <span>{s.objections}</span>
                            <span style={{ color: s.handled === s.objections ? 'var(--color-success)' : 'var(--color-warning)' }}>{s.handled}/{s.objections}</span>
                            <span style={{ color: 'var(--color-neutral-500)' }}>{s.time}</span>
                            <span style={{ color: 'var(--color-neutral-400)', fontSize: 'var(--text-xs)' }}>{s.date}</span>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
