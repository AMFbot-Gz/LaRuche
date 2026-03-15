'use client';

import React, { useState } from 'react';

export interface NavItem {
    id: string;
    label: string;
    icon?: React.ReactNode;
    href: string;
    badge?: number;
}

export interface SideNavProps {
    brand: {
        icon?: React.ReactNode;
        name: string;
    };
    items: NavItem[];
    activeId?: string;
    bottomItems?: NavItem[];
    user?: {
        name: string;
        email: string;
        avatar?: string;
    };
    onNavigate?: (item: NavItem) => void;
}

export function SideNav({ brand, items, activeId, bottomItems, user, onNavigate }: SideNavProps) {
    return (
        <nav style={{
            width: '240px',
            minHeight: '100vh',
            background: 'var(--color-white)',
            borderRight: '1px solid var(--color-neutral-200)',
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-4) 0',
        }}>
            {/* Brand */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: '0 var(--space-5)',
                marginBottom: 'var(--space-8)',
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-600))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'var(--font-bold)',
                    fontSize: 'var(--text-sm)',
                }}>
                    {brand.icon || brand.name.charAt(0)}
                </div>
                <span style={{
                    fontSize: 'var(--text-lg)',
                    fontWeight: 'var(--font-bold)',
                    color: 'var(--color-neutral-900)',
                }}>
                    {brand.name}
                </span>
            </div>

            {/* Main Nav */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', padding: '0 var(--space-3)' }}>
                {items.map((item) => {
                    const isActive = item.id === activeId;
                    return (
                        <a
                            key={item.id}
                            href={item.href}
                            onClick={(e) => { e.preventDefault(); onNavigate?.(item); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-3)',
                                padding: 'var(--space-3) var(--space-4)',
                                borderRadius: 'var(--radius-lg)',
                                fontSize: 'var(--text-sm)',
                                fontWeight: isActive ? 'var(--font-semibold)' : 'var(--font-medium)',
                                color: isActive ? 'var(--color-primary-600)' : 'var(--color-neutral-600)',
                                background: isActive ? 'var(--color-primary-50)' : 'transparent',
                                textDecoration: 'none',
                                transition: 'var(--transition-fast)',
                                cursor: 'pointer',
                                position: 'relative',
                            }}
                        >
                            {item.icon && <span style={{ display: 'flex', width: '20px', justifyContent: 'center' }}>{item.icon}</span>}
                            <span style={{ flex: 1 }}>{item.label}</span>
                            {item.badge !== undefined && item.badge > 0 && (
                                <span style={{
                                    background: 'var(--color-primary-500)',
                                    color: 'white',
                                    fontSize: '10px',
                                    fontWeight: 'var(--font-bold)',
                                    padding: '1px 6px',
                                    borderRadius: 'var(--radius-full)',
                                    minWidth: '18px',
                                    textAlign: 'center',
                                }}>
                                    {item.badge}
                                </span>
                            )}
                        </a>
                    );
                })}
            </div>

            {/* Bottom Items */}
            {bottomItems && bottomItems.length > 0 && (
                <div style={{ borderTop: '1px solid var(--color-neutral-200)', paddingTop: 'var(--space-3)', margin: '0 var(--space-3)' }}>
                    {bottomItems.map((item) => (
                        <a
                            key={item.id}
                            href={item.href}
                            onClick={(e) => { e.preventDefault(); onNavigate?.(item); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-3)',
                                padding: 'var(--space-3) var(--space-4)',
                                fontSize: 'var(--text-sm)',
                                color: 'var(--color-neutral-500)',
                                textDecoration: 'none',
                                borderRadius: 'var(--radius-lg)',
                            }}
                        >
                            {item.icon && <span style={{ display: 'flex', width: '20px', justifyContent: 'center' }}>{item.icon}</span>}
                            {item.label}
                        </a>
                    ))}
                </div>
            )}

            {/* User */}
            {user && (
                <div style={{
                    borderTop: '1px solid var(--color-neutral-200)',
                    padding: 'var(--space-4) var(--space-5)',
                    marginTop: 'var(--space-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--color-neutral-200)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 'var(--text-sm)',
                        fontWeight: 'var(--font-semibold)',
                        color: 'var(--color-neutral-600)',
                        overflow: 'hidden',
                    }}>
                        {user.avatar
                            ? <img src={user.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : user.name.charAt(0)
                        }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-neutral-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.name}
                        </p>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.email}
                        </p>
                    </div>
                </div>
            )}
        </nav>
    );
}
