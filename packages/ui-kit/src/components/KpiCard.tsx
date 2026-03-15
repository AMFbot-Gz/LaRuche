import React from 'react';

export interface KpiCardProps {
    icon?: React.ReactNode;
    label: string;
    value: string | number;
    trend?: {
        value: string;
        direction: 'up' | 'down' | 'neutral';
        label?: string;
    };
    className?: string;
}

export function KpiCard({ icon, label, value, trend, className = '' }: KpiCardProps) {
    const trendColor = trend?.direction === 'up'
        ? 'var(--color-success)'
        : trend?.direction === 'down'
            ? 'var(--color-error)'
            : 'var(--color-neutral-500)';

    return (
        <div className={`kpi-card ${className}`} style={{
            background: 'var(--color-white)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-6)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            transition: 'var(--transition-normal)',
            border: '1px solid var(--color-neutral-100)',
            cursor: 'default',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {icon && (
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--color-primary-50)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-primary-500)',
                    }}>
                        {icon}
                    </div>
                )}
                {trend && (
                    <span style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 'var(--font-medium)',
                        color: trendColor,
                        background: trend.direction === 'up' ? 'var(--color-success-light)' : trend.direction === 'down' ? 'var(--color-error-light)' : 'var(--color-neutral-100)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                    }}>
                        {trend.direction === 'up' ? '↗' : trend.direction === 'down' ? '↘' : '→'} {trend.value}
                    </span>
                )}
            </div>
            <div>
                <p style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-neutral-500)',
                    marginBottom: 'var(--space-1)',
                    fontWeight: 'var(--font-medium)',
                }}>
                    {label}
                </p>
                <p style={{
                    fontSize: 'var(--text-3xl)',
                    fontWeight: 'var(--font-bold)',
                    color: 'var(--color-neutral-900)',
                    lineHeight: 'var(--leading-tight)',
                }}>
                    {value}
                </p>
            </div>
            {trend?.label && (
                <p style={{
                    fontSize: 'var(--text-xs)',
                    color: trendColor,
                    marginTop: '-4px',
                }}>
                    {trend.label}
                </p>
            )}
        </div>
    );
}
