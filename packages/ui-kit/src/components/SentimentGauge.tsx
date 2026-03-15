import React from 'react';

export interface SentimentGaugeProps {
    label: string;
    value: number;
    maxValue?: number;
    direction?: 'up' | 'down' | 'neutral';
    change?: string;
    size?: 'sm' | 'md' | 'lg';
}

export function SentimentGauge({
    label,
    value,
    maxValue = 100,
    direction,
    change,
    size = 'md',
}: SentimentGaugeProps) {
    const percentage = Math.min(100, (value / maxValue) * 100);
    const barColor = percentage >= 70
        ? 'var(--color-success-main)'
        : percentage >= 40
            ? 'var(--color-primary-500)'
            : 'var(--color-error-main)';

    const sizeStyles = {
        sm: { fontSize: 'var(--text-lg)', barHeight: '4px' },
        md: { fontSize: 'var(--text-2xl)', barHeight: '6px' },
        lg: { fontSize: 'var(--text-4xl)', barHeight: '8px' },
    };

    const s = sizeStyles[size];

    return (
        <div style={{
            background: 'var(--color-white)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-neutral-100)',
            padding: 'var(--space-4)',
        }}>
            <p style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-neutral-500)',
                marginBottom: 'var(--space-2)',
            }}>
                {label}
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                <span style={{
                    fontSize: s.fontSize,
                    fontWeight: 'var(--font-bold)',
                    color: barColor,
                }}>
                    {value}{maxValue === 100 ? '%' : `/${maxValue}`}
                </span>
                {direction && change && (
                    <span style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 'var(--font-medium)',
                        color: direction === 'up' ? 'var(--color-success-main)' : direction === 'down' ? 'var(--color-error-main)' : 'var(--color-neutral-400)',
                    }}>
                        {direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'}{change}
                    </span>
                )}
            </div>
            <div style={{
                width: '100%',
                height: s.barHeight,
                background: 'var(--color-neutral-100)',
                borderRadius: 'var(--radius-full)',
                marginTop: 'var(--space-3)',
                overflow: 'hidden',
            }}>
                <div style={{
                    width: `${percentage}%`,
                    height: '100%',
                    background: barColor,
                    borderRadius: 'var(--radius-full)',
                    transition: 'width 0.6s ease',
                }} />
            </div>
        </div>
    );
}
