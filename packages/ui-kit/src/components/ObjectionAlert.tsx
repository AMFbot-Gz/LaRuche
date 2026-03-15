import React from 'react';

export interface ObjectionAlertProps {
    type: string;
    description: string;
    suggestions?: SuggestedResponse[];
}

export interface SuggestedResponse {
    id: string;
    label: string;
    text: string;
    onCopy?: () => void;
}

export function ObjectionAlert({ type, description, suggestions }: ObjectionAlertProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Alert Banner */}
            <div style={{
                background: 'var(--color-error-light)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
                    <span style={{ color: 'var(--color-error-main)' }}>⚠</span>
                    <span style={{
                        fontSize: 'var(--text-sm)',
                        fontWeight: 'var(--font-bold)',
                        color: 'var(--color-error-dark)',
                    }}>
                        Objection Detected: {type}
                    </span>
                </div>
                <p style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-error-dark)',
                    opacity: 0.8,
                    marginLeft: 'var(--space-6)',
                }}>
                    {description}
                </p>
            </div>

            {/* Suggested Responses */}
            {suggestions && suggestions.length > 0 && (
                <div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-3)',
                    }}>
                        <span style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 'var(--font-bold)',
                            letterSpacing: '0.05em',
                            color: 'var(--color-neutral-500)',
                        }}>
                            SUGGESTED RESPONSES
                        </span>
                        <a href="#" style={{
                            fontSize: 'var(--text-xs)',
                            fontWeight: 'var(--font-semibold)',
                            color: 'var(--color-primary-500)',
                            textDecoration: 'none',
                        }}>
                            View Playbook
                        </a>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {suggestions.map((suggestion) => (
                            <div key={suggestion.id} style={{
                                background: 'var(--color-neutral-50)',
                                border: '1px solid var(--color-neutral-200)',
                                borderRadius: 'var(--radius-lg)',
                                padding: 'var(--space-4)',
                                position: 'relative',
                            }}>
                                <span style={{
                                    display: 'inline-block',
                                    fontSize: '10px',
                                    fontWeight: 'var(--font-bold)',
                                    color: 'var(--color-primary-600)',
                                    background: 'var(--color-primary-50)',
                                    border: '1px solid var(--color-primary-200)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '1px 8px',
                                    marginBottom: 'var(--space-2)',
                                }}>
                                    {suggestion.label}
                                </span>
                                <p style={{
                                    fontSize: 'var(--text-sm)',
                                    color: 'var(--color-neutral-700)',
                                    lineHeight: 'var(--leading-relaxed)',
                                }}>
                                    &ldquo;{suggestion.text}&rdquo;
                                </p>
                                {suggestion.onCopy && (
                                    <button
                                        onClick={suggestion.onCopy}
                                        style={{
                                            position: 'absolute',
                                            top: 'var(--space-3)',
                                            right: 'var(--space-3)',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--color-neutral-400)',
                                            fontSize: 'var(--text-sm)',
                                        }}
                                        title="Copy"
                                    >
                                        📋
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
