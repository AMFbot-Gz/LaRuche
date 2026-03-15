/* ============================================================
   Revenue Intelligence OS – Design Tokens
   Brand Identity: Deep tech blue + electric teal + warm coral
   ============================================================ */

export const colors = {
    /* ── Primary (Deep Electric Blue — Intelligence) ── */
    primary: {
        50: '#EFF6FF',
        100: '#DBEAFE',
        200: '#BFDBFE',
        300: '#93C5FD',
        400: '#60A5FA',
        500: '#2563EB',  /* Main brand blue */
        600: '#1D4ED8',
        700: '#1E40AF',
        800: '#1E3A8A',
        900: '#172554',
    },

    /* ── Accent (Electric Teal — Growth) ── */
    accent: {
        50: '#F0FDFA',
        100: '#CCFBF1',
        200: '#99F6E4',
        300: '#5EEAD4',
        400: '#2DD4BF',
        500: '#14B8A6',    /* Teal accent */
        600: '#0D9488',
        700: '#0F766E',
        800: '#115E59',
        900: '#134E4A',
    },

    /* ── Revenue (Warm Coral — Revenue metrics) ── */
    revenue: {
        50: '#FFF7ED',
        100: '#FFEDD5',
        200: '#FED7AA',
        300: '#FDBA74',
        400: '#FB923C',
        500: '#F97316',   /* Revenue/conversion orange */
        600: '#EA580C',
        700: '#C2410C',
        800: '#9A3412',
        900: '#7C2D12',
    },

    /* ── Neutral (Cool Slate) ── */
    neutral: {
        0: '#FFFFFF',
        50: '#F8FAFC',
        100: '#F1F5F9',
        200: '#E2E8F0',
        300: '#CBD5E1',
        400: '#94A3B8',
        500: '#64748B',
        600: '#475569',
        700: '#334155',
        800: '#1E293B',
        900: '#0F172A',
        950: '#020617',
    },

    /* ── Semantic ── */
    success: { light: '#DCFCE7', main: '#22C55E', dark: '#15803D' },
    warning: { light: '#FEF3C7', main: '#F59E0B', dark: '#B45309' },
    error: { light: '#FEE2E2', main: '#EF4444', dark: '#B91C1C' },
    info: { light: '#DBEAFE', main: '#3B82F6', dark: '#1D4ED8' },

    /* ── Churn Risk Scale ── */
    churn: {
        low: '#22C55E',
        medium: '#F59E0B',
        high: '#EF4444',
        critical: '#DC2626',
    },
} as const;

export const typography = {
    fontFamily: {
        sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        mono: "'JetBrains Mono', 'Fira Code', monospace",
        display: "'Plus Jakarta Sans', 'Inter', sans-serif",
    },
    fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
    },
    fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
        extrabold: '800',
    },
    lineHeight: {
        tight: '1.25',
        normal: '1.5',
        relaxed: '1.75',
    },
} as const;

export const spacing = {
    0: '0', 1: '0.25rem', 2: '0.5rem', 3: '0.75rem',
    4: '1rem', 5: '1.25rem', 6: '1.5rem', 8: '2rem',
    10: '2.5rem', 12: '3rem', 16: '4rem', 20: '5rem', 24: '6rem',
} as const;

export const radii = {
    none: '0', sm: '0.375rem', md: '0.5rem', lg: '0.75rem',
    xl: '1rem', '2xl': '1.5rem', full: '9999px',
} as const;

export const shadows = {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    card: '0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
    elevated: '0 4px 12px rgb(0 0 0 / 0.08)',
    glow: '0 0 20px rgba(37, 99, 235, 0.15)',
    'glow-teal': '0 0 20px rgba(20, 184, 166, 0.15)',
} as const;

export const gradients = {
    brand: 'linear-gradient(135deg, #2563EB 0%, #14B8A6 100%)',
    brandSubtle: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDFA 100%)',
    revenue: 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)',
    dark: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
    sidebar: 'linear-gradient(180deg, #0F172A 0%, #172554 100%)',
} as const;

export const transitions = {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
    spring: '500ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

export const breakpoints = {
    sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px',
} as const;

export const zIndex = {
    dropdown: 1000, sticky: 1020, modal: 1050,
    popover: 1060, tooltip: 1070, toast: 1080,
} as const;
