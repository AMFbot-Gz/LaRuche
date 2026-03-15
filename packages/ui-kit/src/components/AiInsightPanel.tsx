import React from 'react';

export interface AiInsightPanelProps {
    title?: string;
    insights: AiInsight[];
    className?: string;
}

export interface AiInsight {
    id: string;
    priority: 'high' | 'medium' | 'low' | 'trend';
    title: string;
    description: string;
    timeAgo?: string;
    action?: {
        label: string;
        onClick?: () => void;
    };
    highlightedEntity?: string;
}

const priorityStyles: Record<string, { bg: string; color: string; label: string }> = {
    high: { bg: 'var(--color-error-light)', color: 'var(--color-error-dark)', label: 'HIGH PRIORITY' },
    medium: { bg: 'var(--color-warning-light)', color: 'var(--color-warning-dark)', label: 'MEDIUM' },
    low: { bg: 'var(--color-info-light)', color: 'var(--color-info-dark)', label: 'LOW' },
    trend: { bg: 'var(--color-success-light)', color: 'var(--color-success-dark)', label: 'TREND' },
};

export function AiInsightPanel({ title = 'AI Insights', insights, className = '' }: AiInsightPanelProps) {
    return (
        <div className={className} style={{
            background: 'var(--color-white)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-neutral-100)',
            boxShadow: 'var(--shadow-card)',
            overflow: 'hidden',
        }}>
            <div style={{
                padding: 'var(--space-5)',
                borderBottom: '1px solid var(--color-neutral-100)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
            }}>
                <span style={{ fontSize: 'var(--text-lg)' }}>✨</span>
                <h3 style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 'var(--font-bold)',
                    color: 'var(--color-neutral-900)',
                }}>
                    {title}
                </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {insights.map((insight, i) => {
                    const style = priorityStyles[insight.priority] || priorityStyles.low;
                    return (
                        <div key={insight.id} style={{
                            padding: 'var(--space-4) var(--space-5)',
                            borderBottom: i < insights.length - 1 ? '1px solid var(--color-neutral-100)' : 'none',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                                <span style={{
                                    fontSize: '10px',
                                    fontWeight: 'var(--font-bold)',
                                    letterSpacing: '0.05em',
                                    color: style.color,
                                    background: style.bg,
                                    padding: '2px 8px',
                                    borderRadius: 'var(--radius-sm)',
                                }}>
                                    {style.label}
                                </span>
                                {insight.timeAgo && (
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-400)' }}>
                                        {insight.timeAgo}
                                    </span>
                                )}
                            </div>
                            <p style={{
                                fontSize: 'var(--text-sm)',
                                fontWeight: 'var(--font-semibold)',
                                color: 'var(--color-neutral-800)',
                                marginBottom: 'var(--space-1)',
                            }}>
                                {insight.title}
                                {insight.highlightedEntity && (
                                    <span style={{ color: 'var(--color-primary-500)', fontWeight: 'var(--font-bold)' }}>
                                        {' '}{insight.highlightedEntity}
                                    </span>
                                )}
                            </p>
                            <p style={{
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-neutral-500)',
                                lineHeight: 'var(--leading-relaxed)',
                            }}>
                                {insight.description}
                            </p>
                            {insight.action && (
                                <button
                                    onClick={insight.action.onClick}
                                    style={{
                                        marginTop: 'var(--space-3)',
                                        fontSize: 'var(--text-xs)',
                                        fontWeight: 'var(--font-medium)',
                                        color: 'var(--color-neutral-600)',
                                        background: 'none',
                                        border: '1px solid var(--color-neutral-200)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: 'var(--space-2) var(--space-4)',
                                        cursor: 'pointer',
                                        transition: 'var(--transition-fast)',
                                    }}
                                >
                                    {insight.action.label}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
