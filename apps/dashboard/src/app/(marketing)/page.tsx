'use client';

import React, { useState } from 'react';

/* ─────────────────────────────────────────────
   Palette Catppuccin Mocha
───────────────────────────────────────────── */
const C = {
    bg:         '#1e1e2e',
    surface0:   '#313244',
    surface1:   '#45475a',
    overlay:    '#585b70',
    text:       '#cdd6f4',
    subtext:    '#a6adc8',
    mauve:      '#cba6f7',
    blue:       '#89b4fa',
    green:      '#a6e3a1',
    yellow:     '#f9e2af',
    peach:      '#fab387',
    red:        '#f38ba8',
    teal:       '#94e2d5',
    lavender:   '#b4befe',
} as const;

/* ─────────────────────────────────────────────
   Styles utilitaires réutilisables
───────────────────────────────────────────── */
const S = {
    section: {
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '80px 24px',
    } as React.CSSProperties,

    sectionAlt: {
        background: `${C.surface0}55`,
    } as React.CSSProperties,

    tag: {
        display: 'inline-block',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase' as const,
        color: C.mauve,
        background: `${C.mauve}18`,
        border: `1px solid ${C.mauve}40`,
        borderRadius: '20px',
        padding: '4px 14px',
        marginBottom: '20px',
    } as React.CSSProperties,

    h2: {
        fontSize: 'clamp(28px, 4vw, 42px)',
        fontWeight: 800,
        color: C.text,
        margin: '0 0 16px',
        lineHeight: 1.2,
    } as React.CSSProperties,

    lead: {
        fontSize: '18px',
        color: C.subtext,
        margin: '0 0 48px',
        lineHeight: 1.7,
        maxWidth: '540px',
    } as React.CSSProperties,

    card: {
        background: C.surface0,
        border: `1px solid ${C.surface1}`,
        borderRadius: '16px',
        padding: '32px',
        transition: 'transform 0.2s ease, border-color 0.2s ease',
    } as React.CSSProperties,
} as const;

/* ─────────────────────────────────────────────
   Composant : Bouton CTA principal
───────────────────────────────────────────── */
function CtaButton({
    children,
    variant = 'primary',
    large = false,
}: {
    children: React.ReactNode;
    variant?: 'primary' | 'ghost';
    large?: boolean;
}) {
    const [hovered, setHovered] = useState(false);

    const base: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: large ? '16px 36px' : '12px 28px',
        fontSize: large ? '17px' : '15px',
        fontWeight: 700,
        borderRadius: '12px',
        cursor: 'pointer',
        border: 'none',
        transition: 'all 0.2s ease',
        textDecoration: 'none',
    };

    const primary: React.CSSProperties = {
        ...base,
        background: hovered
            ? `linear-gradient(135deg, ${C.lavender}, ${C.blue})`
            : `linear-gradient(135deg, ${C.mauve}, ${C.blue})`,
        color: '#1e1e2e',
        boxShadow: hovered
            ? `0 8px 32px ${C.mauve}60`
            : `0 4px 16px ${C.mauve}40`,
        transform: hovered ? 'translateY(-2px)' : 'none',
    };

    const ghost: React.CSSProperties = {
        ...base,
        background: hovered ? `${C.surface1}` : 'transparent',
        color: C.text,
        border: `1px solid ${C.surface1}`,
        transform: hovered ? 'translateY(-1px)' : 'none',
    };

    return (
        <button
            style={variant === 'primary' ? primary : ghost}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {children}
        </button>
    );
}

/* ─────────────────────────────────────────────
   Composant : Carte Feature
───────────────────────────────────────────── */
function FeatureCard({
    icon,
    title,
    description,
    accentColor,
}: {
    icon: string;
    title: string;
    description: string;
    accentColor: string;
}) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            style={{
                ...S.card,
                borderColor: hovered ? accentColor + '60' : C.surface1,
                transform: hovered ? 'translateY(-4px)' : 'none',
                cursor: 'default',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Icône */}
            <div
                style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: `${accentColor}18`,
                    border: `1px solid ${accentColor}35`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '26px',
                    marginBottom: '20px',
                }}
            >
                {icon}
            </div>

            <h3
                style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: C.text,
                    margin: '0 0 10px',
                }}
            >
                {title}
            </h3>
            <p
                style={{
                    fontSize: '15px',
                    color: C.subtext,
                    lineHeight: 1.65,
                    margin: 0,
                }}
            >
                {description}
            </p>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Composant : Étape How it works
───────────────────────────────────────────── */
function Step({
    number,
    title,
    description,
    isLast = false,
}: {
    number: number;
    title: string;
    description: string;
    isLast?: boolean;
}) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                flex: 1,
                position: 'relative',
            }}
        >
            {/* Connecteur entre étapes */}
            {!isLast && (
                <div
                    style={{
                        position: 'absolute',
                        top: '26px',
                        left: 'calc(50% + 26px)',
                        right: 'calc(-50% + 26px)',
                        height: '2px',
                        background: `linear-gradient(90deg, ${C.mauve}60, ${C.blue}60)`,
                        zIndex: 0,
                    }}
                />
            )}

            {/* Numéro */}
            <div
                style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${C.mauve}30, ${C.blue}30)`,
                    border: `2px solid ${C.mauve}60`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    fontWeight: 800,
                    color: C.mauve,
                    marginBottom: '20px',
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                {number}
            </div>

            <h3
                style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: C.text,
                    margin: '0 0 10px',
                }}
            >
                {title}
            </h3>
            <p
                style={{
                    fontSize: '14px',
                    color: C.subtext,
                    lineHeight: 1.6,
                    margin: 0,
                    maxWidth: '200px',
                }}
            >
                {description}
            </p>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Composant : Carte Pricing
───────────────────────────────────────────── */
function PricingCard({
    name,
    price,
    period,
    features,
    highlighted = false,
    badge,
}: {
    name: string;
    price: string;
    period: string;
    features: string[];
    highlighted?: boolean;
    badge?: string;
}) {
    const [hovered, setHovered] = useState(false);

    return (
        <div
            style={{
                ...S.card,
                position: 'relative',
                border: highlighted
                    ? `2px solid ${C.mauve}80`
                    : `1px solid ${hovered ? C.surface1 + 'ff' : C.surface1}`,
                background: highlighted
                    ? `linear-gradient(180deg, ${C.surface0}, ${C.bg})`
                    : C.surface0,
                transform: highlighted
                    ? 'scale(1.03)'
                    : hovered
                    ? 'translateY(-4px)'
                    : 'none',
                boxShadow: highlighted
                    ? `0 0 48px ${C.mauve}20`
                    : 'none',
                transition: 'all 0.25s ease',
                flex: 1,
                minWidth: 0,
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Badge "Populaire" */}
            {badge && (
                <div
                    style={{
                        position: 'absolute',
                        top: '-13px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: `linear-gradient(135deg, ${C.mauve}, ${C.blue})`,
                        color: '#1e1e2e',
                        fontSize: '11px',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        padding: '4px 14px',
                        borderRadius: '20px',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {badge}
                </div>
            )}

            {/* Nom du plan */}
            <p
                style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: highlighted ? C.mauve : C.subtext,
                    margin: '0 0 16px',
                }}
            >
                {name}
            </p>

            {/* Prix */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', marginBottom: '24px' }}>
                <span
                    style={{
                        fontSize: '48px',
                        fontWeight: 800,
                        lineHeight: 1,
                        color: C.text,
                    }}
                >
                    {price}
                </span>
                <span style={{ fontSize: '14px', color: C.subtext, marginBottom: '8px' }}>
                    {period}
                </span>
            </div>

            {/* Séparateur */}
            <div
                style={{
                    height: '1px',
                    background: highlighted ? `${C.mauve}30` : C.surface1,
                    margin: '0 0 24px',
                }}
            />

            {/* Features */}
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {features.map((f) => (
                    <li
                        key={f}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '14px',
                            color: C.subtext,
                        }}
                    >
                        <span style={{ color: C.green, fontSize: '16px', flexShrink: 0 }}>✓</span>
                        {f}
                    </li>
                ))}
            </ul>

            {/* CTA */}
            <button
                style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '10px',
                    fontSize: '15px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: highlighted ? 'none' : `1px solid ${C.surface1}`,
                    background: highlighted
                        ? `linear-gradient(135deg, ${C.mauve}, ${C.blue})`
                        : 'transparent',
                    color: highlighted ? '#1e1e2e' : C.text,
                    transition: 'all 0.2s ease',
                }}
            >
                {name === 'Free' ? 'Commencer gratuitement' : `Choisir ${name}`}
            </button>
        </div>
    );
}

/* ─────────────────────────────────────────────
   Page principale : Landing Chimera
───────────────────────────────────────────── */
export default function LandingPage() {
    return (
        <div style={{ background: C.bg, color: C.text, overflowX: 'hidden' }}>

            {/* ── NAVBAR ─────────────────────────────── */}
            <header
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 100,
                    background: `${C.bg}e0`,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderBottom: `1px solid ${C.surface0}`,
                }}
            >
                <div
                    style={{
                        maxWidth: '1100px',
                        margin: '0 auto',
                        padding: '0 24px',
                        height: '64px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    {/* Logo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                            style={{
                                width: '34px',
                                height: '34px',
                                borderRadius: '10px',
                                background: `linear-gradient(135deg, ${C.mauve}, ${C.blue})`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '18px',
                            }}
                        >
                            ⬡
                        </div>
                        <span
                            style={{
                                fontSize: '20px',
                                fontWeight: 800,
                                background: `linear-gradient(135deg, ${C.mauve}, ${C.blue})`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            }}
                        >
                            Chimera
                        </span>
                    </div>

                    {/* Nav liens */}
                    <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {['Fonctionnalités', 'Comment ça marche', 'Pricing'].map((label) => (
                            <a
                                key={label}
                                href={`#${label.toLowerCase().replace(/\s/g, '-')}`}
                                style={{
                                    fontSize: '14px',
                                    color: C.subtext,
                                    textDecoration: 'none',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    transition: 'color 0.15s',
                                }}
                            >
                                {label}
                            </a>
                        ))}
                        <div style={{ width: '1px', height: '20px', background: C.surface1, margin: '0 8px' }} />
                        <CtaButton>Commencer gratuitement</CtaButton>
                    </nav>
                </div>
            </header>

            {/* ── HERO ───────────────────────────────── */}
            <section
                style={{
                    ...S.section,
                    textAlign: 'center',
                    paddingTop: '120px',
                    paddingBottom: '100px',
                    position: 'relative',
                }}
            >
                {/* Halo décoratif */}
                <div
                    aria-hidden
                    style={{
                        position: 'absolute',
                        top: '60px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '700px',
                        height: '400px',
                        background: `radial-gradient(ellipse at center, ${C.mauve}18 0%, transparent 70%)`,
                        pointerEvents: 'none',
                        zIndex: 0,
                    }}
                />

                <div style={{ position: 'relative', zIndex: 1 }}>
                    {/* Tag */}
                    <div style={S.tag}>Agent IA autonome pour macOS</div>

                    {/* Titre principal */}
                    <h1
                        style={{
                            fontSize: 'clamp(40px, 6vw, 72px)',
                            fontWeight: 900,
                            lineHeight: 1.08,
                            margin: '0 0 24px',
                            letterSpacing: '-0.02em',
                        }}
                    >
                        <span style={{ color: C.text }}>L'agent IA qui</span>
                        <br />
                        <span
                            style={{
                                background: `linear-gradient(135deg, ${C.mauve} 0%, ${C.blue} 60%, ${C.teal} 100%)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            }}
                        >
                            pilote ton Mac
                        </span>
                    </h1>

                    {/* Sous-titre */}
                    <p
                        style={{
                            fontSize: 'clamp(16px, 2vw, 20px)',
                            color: C.subtext,
                            maxWidth: '560px',
                            margin: '0 auto 40px',
                            lineHeight: 1.6,
                        }}
                    >
                        Chimera voit ton écran, génère du code, exécute des tâches complexes
                        et apprend de chaque session — en temps réel, sans friction.
                    </p>

                    {/* CTAs */}
                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <CtaButton large>
                            Commencer gratuitement →
                        </CtaButton>
                        <CtaButton variant="ghost" large>
                            Voir la démo
                        </CtaButton>
                    </div>

                    {/* Social proof */}
                    <p
                        style={{
                            marginTop: '32px',
                            fontSize: '13px',
                            color: C.overlay,
                        }}
                    >
                        Gratuit pour commencer · Aucune carte de crédit requise
                    </p>

                    {/* Aperçu terminal fictif */}
                    <div
                        style={{
                            marginTop: '64px',
                            background: C.surface0,
                            border: `1px solid ${C.surface1}`,
                            borderRadius: '16px',
                            padding: '20px 24px',
                            maxWidth: '680px',
                            margin: '64px auto 0',
                            textAlign: 'left',
                            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                            fontSize: '14px',
                        }}
                    >
                        {/* Barre de titre */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            {[C.red, C.yellow, C.green].map((c) => (
                                <div key={c} style={{ width: '12px', height: '12px', borderRadius: '50%', background: c }} />
                            ))}
                            <span style={{ marginLeft: '8px', fontSize: '12px', color: C.overlay }}>Chimera Agent</span>
                        </div>
                        {/* Lignes de "terminal" */}
                        {[
                            { color: C.green,  text: '$ chimera run "Analyse mes emails et résume les urgences"' },
                            { color: C.mauve,  text: '→ Capture écran Mail.app...' },
                            { color: C.blue,   text: '→ 3 emails urgents détectés — résumé généré en 2.1s' },
                            { color: C.teal,   text: '→ Brouillon de réponse créé dans Drafts' },
                            { color: C.subtext, text: '  Session sauvegardée · Mémoire mise à jour ✓' },
                        ].map((line, i) => (
                            <div key={i} style={{ color: line.color, lineHeight: 1.8 }}>
                                {line.text}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FEATURES ───────────────────────────── */}
            <section id="fonctionnalités" style={{ ...S.sectionAlt }}>
                <div style={S.section}>
                    <div style={{ textAlign: 'center', marginBottom: '56px' }}>
                        <div style={S.tag}>Fonctionnalités</div>
                        <h2 style={{ ...S.h2, margin: '0 auto 16px' }}>
                            Tout ce dont tu as besoin, rien de superflu
                        </h2>
                        <p style={{ ...S.lead, margin: '0 auto', textAlign: 'center' }}>
                            Trois capacités fondamentales qui transforment ton flux de travail.
                        </p>
                    </div>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '24px',
                        }}
                    >
                        <FeatureCard
                            icon="🖥️"
                            title="Computer Use"
                            description="L'agent voit ton écran et agit directement : clique, tape, navigue dans tes apps. Comme un assistant humain, mais 100× plus rapide."
                            accentColor={C.mauve}
                        />
                        <FeatureCard
                            icon="⚡"
                            title="Auto-Coder"
                            description="Génère et exécute du code en sandbox sécurisé. L'agent écrit, teste et itère sans jamais toucher ton environnement de production."
                            accentColor={C.blue}
                        />
                        <FeatureCard
                            icon="🧠"
                            title="Mémoire"
                            description="Apprend de chaque session. Tes préférences, tes projets, ton contexte — tout est retenu pour que l'agent s'améliore avec toi."
                            accentColor={C.teal}
                        />
                    </div>
                </div>
            </section>

            {/* ── HOW IT WORKS ───────────────────────── */}
            <section id="comment-ça-marche">
                <div style={S.section}>
                    <div style={{ textAlign: 'center', marginBottom: '64px' }}>
                        <div style={S.tag}>Comment ça marche</div>
                        <h2 style={{ ...S.h2, margin: '0 auto 16px' }}>
                            Simple comme donner un objectif
                        </h2>
                        <p style={{ ...S.lead, margin: '0 auto', textAlign: 'center' }}>
                            Trois étapes. Aucune configuration. Résultat immédiat.
                        </p>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            gap: '32px',
                            alignItems: 'flex-start',
                            flexWrap: 'wrap',
                        }}
                    >
                        <Step
                            number={1}
                            title="Donne un objectif"
                            description="Décris en langage naturel ce que tu veux accomplir, aussi précis ou vague que tu le souhaites."
                        />
                        <Step
                            number={2}
                            title="L'agent agit"
                            description="Chimera observe ton écran, planifie les actions et les exécute étape par étape — en toute sécurité."
                        />
                        <Step
                            number={3}
                            title="Tu vois le résultat en direct"
                            description="Chaque action est visible dans le dashboard en temps réel. Tu gardes le contrôle à chaque instant."
                            isLast
                        />
                    </div>
                </div>
            </section>

            {/* ── PRICING ────────────────────────────── */}
            <section id="pricing" style={{ ...S.sectionAlt }}>
                <div style={S.section}>
                    <div style={{ textAlign: 'center', marginBottom: '64px' }}>
                        <div style={S.tag}>Pricing</div>
                        <h2 style={{ ...S.h2, margin: '0 auto 16px' }}>
                            Un plan pour chaque usage
                        </h2>
                        <p style={{ ...S.lead, margin: '0 auto', textAlign: 'center' }}>
                            Commence gratuitement. Évolue quand tu es prêt.
                        </p>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            gap: '24px',
                            alignItems: 'stretch',
                            flexWrap: 'wrap',
                        }}
                    >
                        <PricingCard
                            name="Free"
                            price="$0"
                            period="/mois"
                            features={[
                                '10 sessions par mois',
                                '30 min par session',
                                'Computer Use basique',
                                'Mémoire locale',
                                'Support communauté',
                            ]}
                        />
                        <PricingCard
                            name="Pro"
                            price="$19"
                            period="/mois"
                            highlighted
                            badge="Le plus populaire"
                            features={[
                                'Sessions illimitées',
                                "Jusqu'à 4h par session",
                                'Auto-Coder complet',
                                'Mémoire cloud synchronisée',
                                'Priorité de traitement',
                                'Support email sous 24h',
                            ]}
                        />
                        <PricingCard
                            name="Teams"
                            price="$79"
                            period="/mois"
                            features={[
                                '5 workspaces d\'équipe',
                                'Sessions illimitées',
                                'Accès API complet',
                                'Mémoire partagée d\'équipe',
                                'SSO & gestion des rôles',
                                'Support dédié & onboarding',
                            ]}
                        />
                    </div>

                    {/* Note de bas de tableau */}
                    <p
                        style={{
                            textAlign: 'center',
                            marginTop: '32px',
                            fontSize: '13px',
                            color: C.overlay,
                        }}
                    >
                        Tous les plans incluent 14 jours d'essai Pro gratuit · Annulation à tout moment
                    </p>
                </div>
            </section>

            {/* ── CTA FINAL ──────────────────────────── */}
            <section>
                <div
                    style={{
                        ...S.section,
                        textAlign: 'center',
                        paddingTop: '100px',
                        paddingBottom: '120px',
                    }}
                >
                    {/* Halo */}
                    <div
                        aria-hidden
                        style={{
                            position: 'absolute',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '600px',
                            height: '300px',
                            background: `radial-gradient(ellipse at center, ${C.blue}15 0%, transparent 70%)`,
                            pointerEvents: 'none',
                            marginTop: '-80px',
                        }}
                    />

                    <div style={{ position: 'relative' }}>
                        <div style={S.tag}>Prêt à commencer ?</div>

                        <h2
                            style={{
                                fontSize: 'clamp(32px, 5vw, 56px)',
                                fontWeight: 900,
                                lineHeight: 1.1,
                                margin: '0 0 20px',
                                letterSpacing: '-0.02em',
                            }}
                        >
                            Prêt à automatiser ?
                        </h2>

                        <p
                            style={{
                                fontSize: '18px',
                                color: C.subtext,
                                maxWidth: '440px',
                                margin: '0 auto 40px',
                                lineHeight: 1.6,
                            }}
                        >
                            Rejoins les équipes qui font confiance à Chimera pour
                            automatiser leur Mac — dès aujourd'hui.
                        </p>

                        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <CtaButton large>
                                Commencer gratuitement →
                            </CtaButton>
                            <CtaButton variant="ghost" large>
                                Voir la documentation
                            </CtaButton>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── FOOTER ─────────────────────────────── */}
            <footer
                style={{
                    borderTop: `1px solid ${C.surface0}`,
                    padding: '40px 24px',
                }}
            >
                <div
                    style={{
                        maxWidth: '1100px',
                        margin: '0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '16px',
                    }}
                >
                    {/* Logo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                            style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '8px',
                                background: `linear-gradient(135deg, ${C.mauve}, ${C.blue})`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '14px',
                            }}
                        >
                            ⬡
                        </div>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: C.subtext }}>
                            Chimera
                        </span>
                    </div>

                    {/* Liens */}
                    <div style={{ display: 'flex', gap: '24px' }}>
                        {['Confidentialité', 'Conditions', 'GitHub', 'Contact'].map((label) => (
                            <a
                                key={label}
                                href="#"
                                style={{
                                    fontSize: '13px',
                                    color: C.overlay,
                                    textDecoration: 'none',
                                    transition: 'color 0.15s',
                                }}
                            >
                                {label}
                            </a>
                        ))}
                    </div>

                    {/* Copyright */}
                    <p style={{ fontSize: '12px', color: C.overlay, margin: 0 }}>
                        © 2025 Chimera. Fait avec soin.
                    </p>
                </div>
            </footer>

        </div>
    );
}
