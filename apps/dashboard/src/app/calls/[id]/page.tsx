'use client';

import React, { useState, useEffect } from 'react';
import { SentimentGauge, ObjectionAlert } from '@saas/ui-kit';
import type { SuggestedResponse } from '@saas/ui-kit';

/* ── SaaS Demo Intelligence Data ── */
const mockTranscript = [
    { id: '1', speaker: 'Sarah Jenkins', role: 'prospect' as const, text: "The API integrations look impressive, but I'm concerned about the implementation timeline for our Q4 rollout.", time: '14:20', sentiment: 'mixed' },
];

const mockSuggestions: SuggestedResponse[] = [
    { id: '1', label: 'Timeline Pivot', text: "Our guided onboarding gets you to first value in 48 hours. For Enterprise, we assign a dedicated implementation engineer. Would a joint implementation timeline help secure Q4 approval?" },
    { id: '2', label: 'ROI Accelerator', text: "Our Q4 early adopters see 3.2x ROI in 90 days. I can build a custom ROI model for your team — would that help with the business case?" },
];

const featureEngagement = [
    { feature: 'API Integrations', interest: 92, trend: 'up', engaged: true },
    { feature: 'Real-time Dashboard', interest: 78, trend: 'up', engaged: true },
    { feature: 'Custom Reports', interest: 45, trend: 'neutral', engaged: false },
    { feature: 'SSO/Security', interest: 88, trend: 'up', engaged: true },
];

const saasDetections = [
    { type: '💰 Pricing Mention', time: '12:45', text: '"What does the Enterprise tier cost?"', severity: 'medium' as const },
    { type: '📅 Budget Timing', time: '14:02', text: '"Q4 rollout timeline"', severity: 'high' as const },
    { type: '🔄 Competitor', time: '08:33', text: '"We currently use Gong for..."', severity: 'high' as const },
];

export default function DemoIntelligencePage() {
    const [callDuration, setCallDuration] = useState(863);

    useEffect(() => {
        const interval = setInterval(() => setCallDuration(d => d + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-neutral-950)' }}>
            {/* Left Mini-nav */}
            <nav style={{
                width: '56px', background: 'var(--color-neutral-900)',
                borderRight: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: 'var(--space-4) 0', gap: 'var(--space-5)',
            }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-lg)', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'var(--font-extrabold)', fontSize: '12px', boxShadow: 'var(--shadow-glow)' }}>R</div>
                {['🎥', '🧠', '📊', '📋'].map((icon, i) => (
                    <button key={i} style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-lg)', border: 'none', background: i === 0 ? 'rgba(37,99,235,0.2)' : 'transparent', color: i === 0 ? 'var(--color-primary-400)' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</button>
                ))}
            </nav>

            {/* Main Call Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Top Bar */}
                <header style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-6)',
                    background: 'var(--color-neutral-900)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <span className="gradient-text" style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-bold)' }}>Revenue OS</span>
                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'rgba(255,255,255,0.7)' }}>
                            🎯 Product Demo: Acme Corp × Enterprise Plan
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                        <span className="live-badge"><span className="live-dot" />Recording</span>
                        <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)', color: 'white', fontFamily: 'var(--font-mono)' }}>{formatTime(callDuration)}</span>
                    </div>
                </header>

                {/* Video */}
                <div style={{ flex: 1, padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div style={{
                        flex: 1, background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-xl)',
                        position: 'relative', minHeight: '380px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    }}>
                        <div style={{ fontSize: '48px', color: 'rgba(255,255,255,0.15)' }}>🎬</div>

                        {/* Demo Score Overlay */}
                        <div style={{
                            position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)',
                            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
                            padding: 'var(--space-3) var(--space-4)',
                            borderRadius: 'var(--radius-xl)',
                            border: '1px solid rgba(37,99,235,0.3)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                        }}>
                            <span style={{ fontSize: '10px', color: 'var(--color-primary-400)', fontWeight: 'var(--font-bold)', letterSpacing: '0.08em' }}>DEMO SCORE</span>
                            <span style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--font-extrabold)', color: 'var(--color-accent-400)', lineHeight: '1' }}>8.4</span>
                            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>/10</span>
                        </div>

                        {/* Speaker */}
                        <div style={{
                            position: 'absolute', bottom: 'var(--space-4)', left: 'var(--space-4)',
                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                            color: 'white', padding: 'var(--space-2) var(--space-4)',
                            borderRadius: 'var(--radius-lg)',
                            fontSize: 'var(--text-sm)',
                        }}>
                            🎙 Sarah Jenkins (VP Sales, Acme Corp)
                        </div>
                    </div>

                    {/* Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', padding: 'var(--space-2)' }}>
                        {['🎙', '📹', '📤', '💬'].map((icon, i) => (
                            <button key={i} style={{
                                width: '44px', height: '44px', borderRadius: 'var(--radius-full)',
                                border: '1px solid rgba(255,255,255,0.15)', background: 'var(--color-neutral-800)',
                                cursor: 'pointer', fontSize: '18px', color: 'rgba(255,255,255,0.8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>{icon}</button>
                        ))}
                        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />
                        <button style={{
                            padding: 'var(--space-3) var(--space-6)', borderRadius: 'var(--radius-full)',
                            border: 'none', background: 'var(--color-error)', color: 'white',
                            fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)', cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(239,68,68,0.4)',
                        }}>📞 End Demo</button>
                    </div>
                </div>
            </div>

            {/* Right: Demo Intelligence Panel */}
            <aside style={{
                width: '400px', background: 'var(--color-neutral-900)',
                borderLeft: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{ padding: 'var(--space-5)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span style={{ fontSize: 'var(--text-lg)' }}>🧠</span>
                            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'white' }}>Demo Intelligence</h2>
                        </div>
                        <span className="live-badge" style={{ fontSize: '10px' }}><span className="live-dot" style={{ width: '6px', height: '6px' }} />LIVE</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', border: '1px solid rgba(37,99,235,0.2)' }}>
                            <p style={{ fontSize: '10px', color: 'var(--color-primary-400)', fontWeight: 'var(--font-bold)' }}>ENGAGEMENT</p>
                            <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-extrabold)', color: 'var(--color-accent-400)' }}>84%</p>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', border: '1px solid rgba(20,184,166,0.2)' }}>
                            <p style={{ fontSize: '10px', color: 'var(--color-accent-400)', fontWeight: 'var(--font-bold)' }}>CLOSE PROB.</p>
                            <p style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-extrabold)', color: 'var(--color-primary-400)' }}>62%</p>
                        </div>
                    </div>
                </div>

                {/* Scrollable content */}
                <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

                    {/* Feature Interest Map */}
                    <div>
                        <h3 style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', letterSpacing: '0.08em', color: 'var(--color-accent-400)', marginBottom: 'var(--space-3)' }}>FEATURE INTEREST MAP</h3>
                        {featureEngagement.map((f) => (
                            <div key={f.feature} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', background: f.engaged ? 'rgba(20,184,166,0.08)' : 'transparent' }}>
                                <div style={{ flex: 1 }}>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.8)', fontWeight: 'var(--font-medium)' }}>{f.feature}</p>
                                    <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-full)', marginTop: '4px' }}>
                                        <div style={{ height: '100%', width: `${f.interest}%`, background: f.interested ? 'var(--color-accent-400)' : 'var(--color-primary-400)', borderRadius: 'var(--radius-full)' }} />
                                    </div>
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: 'var(--font-bold)', color: f.engaged ? 'var(--color-accent-400)' : 'rgba(255,255,255,0.4)' }}>{f.interest}%</span>
                            </div>
                        ))}
                    </div>

                    {/* SaaS Signal Detections */}
                    <div>
                        <h3 style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', letterSpacing: '0.08em', color: 'var(--color-revenue-400)', marginBottom: 'var(--space-3)' }}>SAAS SIGNAL DETECTIONS</h3>
                        {saasDetections.map((d, i) => (
                            <div key={i} style={{
                                padding: 'var(--space-3)',
                                borderRadius: 'var(--radius-lg)',
                                background: d.severity === 'high' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                                border: `1px solid ${d.severity === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                                marginBottom: 'var(--space-2)',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: d.severity === 'high' ? 'var(--color-error)' : 'var(--color-warning)' }}>{d.type}</span>
                                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{d.time}</span>
                                </div>
                                <p style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.6)', marginTop: '4px' }}>{d.text}</p>
                            </div>
                        ))}
                    </div>

                    {/* Transcript */}
                    <div>
                        <h3 style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', letterSpacing: '0.08em', color: 'var(--color-primary-400)', marginBottom: 'var(--space-3)' }}>LIVE TRANSCRIPT</h3>
                        {mockTranscript.map((t) => (
                            <div key={t.id} style={{ display: 'flex', gap: 'var(--space-3)' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-full)', background: 'rgba(37,99,235,0.2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>👤</div>
                                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.7)', lineHeight: 'var(--leading-relaxed)' }}>
                                    &ldquo;{t.text}&rdquo;
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* AI Suggested Responses */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', letterSpacing: '0.08em', color: 'var(--color-accent-400)' }}>AI SUGGESTED RESPONSES</span>
                            <a href="#" style={{ fontSize: '10px', color: 'var(--color-primary-400)' }}>Playbook</a>
                        </div>
                        {mockSuggestions.map((s) => (
                            <div key={s.id} style={{
                                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)', marginBottom: 'var(--space-2)',
                            }}>
                                <span style={{ fontSize: '10px', fontWeight: 'var(--font-bold)', color: 'var(--color-accent-400)', background: 'rgba(20,184,166,0.15)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', display: 'inline-block', marginBottom: 'var(--space-2)' }}>{s.label}</span>
                                <p style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.7)', lineHeight: 'var(--leading-relaxed)' }}>&ldquo;{s.text}&rdquo;</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* AI Chat */}
                <div style={{ padding: 'var(--space-4)', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 'var(--space-2)' }}>
                    <input placeholder="Ask Revenue OS for insights..." style={{
                        flex: 1, padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-lg)',
                        border: '1px solid rgba(255,255,255,0.1)', fontSize: 'var(--text-sm)',
                        outline: 'none', background: 'rgba(255,255,255,0.05)', color: 'white',
                    }} />
                    <button style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-full)', background: 'var(--gradient-brand)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '14px' }}>↑</button>
                </div>
            </aside>
        </div>
    );
}
