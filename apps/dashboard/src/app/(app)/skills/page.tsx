'use client';

/**
 * app/skills/page.tsx — Marketplace des skills Chimera
 *
 * Affiche les 25 skills disponibles avec filtres par catégorie et tier.
 * Permet d'installer / désinstaller un skill via le marketplace endpoint.
 */

import React, { useState, useEffect, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Skill {
  name:        string;
  description: string;
  version:     string;
  category:    string;
  author:      string;
  tier:        'core' | 'community' | 'learned' | 'pro';
  tags:        string[];
  created:     string;
  installed?:  boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const QUEEN_URL = process.env.NEXT_PUBLIC_QUEEN_URL ?? 'http://localhost:3000';

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  core:      { label: 'Core',      color: '#818cf8', bg: 'rgba(129,140,248,0.12)', icon: '⚡' },
  community: { label: 'Community', color: '#34d399', bg: 'rgba(52,211,153,0.12)',  icon: '🌱' },
  learned:   { label: 'Learned',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '🧠' },
  pro:       { label: 'Pro',       color: '#f472b6', bg: 'rgba(244,114,182,0.12)', icon: '⭐' },
};

const CATEGORY_ICONS: Record<string, string> = {
  'computer-use': '🖥',
  filesystem:     '📁',
  browser:        '🌐',
  system:         '⚙️',
  network:        '🌐',
  integration:    '🌉',
  notification:   '🔔',
  analysis:       '🔍',
};

// ─── Composant SkillCard ──────────────────────────────────────────────────────

function SkillCard({ skill, onInstall, onUninstall }: {
  skill:       Skill;
  onInstall:   (name: string) => void;
  onUninstall: (name: string) => void;
}) {
  const tierCfg = TIER_CONFIG[skill.tier] ?? TIER_CONFIG.community;
  const catIcon = CATEGORY_ICONS[skill.category] ?? '🔧';
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    if (skill.installed) await onUninstall(skill.name);
    else                 await onInstall(skill.name);
    setLoading(false);
  }

  return (
    <div style={{
      background:   '#1a1d27',
      border:       '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px',
      padding:      '16px',
      display:      'flex',
      flexDirection: 'column',
      gap:          '10px',
      transition:   'border-color 0.2s',
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = `${tierCfg.color}40`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
    >
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '16px', flexShrink: 0 }}>{catIcon}</span>
          <p style={{
            color:        'white',
            fontWeight:   700,
            fontSize:     '13px',
            margin:       0,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            {skill.name}
          </p>
        </div>
        <span style={{
          fontSize:      '10px',
          fontWeight:    700,
          padding:       '2px 7px',
          borderRadius:  '999px',
          color:         tierCfg.color,
          background:    tierCfg.bg,
          flexShrink:    0,
          letterSpacing: '0.04em',
        }}>
          {tierCfg.icon} {tierCfg.label}
        </span>
      </div>

      {/* Description */}
      <p style={{ color: '#9ca3af', fontSize: '12px', margin: 0, lineHeight: 1.5, flex: 1 }}>
        {skill.description}
      </p>

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {skill.tags.slice(0, 4).map((tag) => (
          <span key={tag} style={{
            fontSize:     '10px',
            padding:      '1px 6px',
            borderRadius: '999px',
            background:   'rgba(255,255,255,0.06)',
            color:        '#6b7280',
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '10px', color: '#4b5563' }}>
          v{skill.version} · {skill.author}
        </div>
        <button
          onClick={toggle}
          disabled={loading}
          style={{
            background:   skill.installed ? 'rgba(248,113,113,0.12)' : tierCfg.bg,
            border:       `1px solid ${skill.installed ? 'rgba(248,113,113,0.3)' : `${tierCfg.color}30`}`,
            borderRadius: '6px',
            color:        skill.installed ? '#f87171' : tierCfg.color,
            fontSize:     '11px',
            fontWeight:   600,
            padding:      '4px 10px',
            cursor:       loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? '…' : skill.installed ? 'Désinstaller' : 'Installer'}
        </button>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SkillsPage() {
  const [skills,     setSkills]     = useState<Skill[]>([]);
  const [search,     setSearch]     = useState('');
  const [category,   setCategory]   = useState<string>('all');
  const [tier,       setTier]       = useState<string>('all');
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);

  // Chargement des skills depuis le marketplace
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${QUEEN_URL}/api/marketplace/skills`);
        if (res.ok) {
          const data = await res.json();
          setSkills(data.skills ?? []);
        } else {
          // Fallback : charger depuis le registry local si Queen non dispo
          loadFallback();
        }
      } catch {
        loadFallback();
      } finally {
        setLoading(false);
      }
    }

    function loadFallback() {
      setError('Queen non accessible — affichage du registry local');
      // Les skills sont injectés statiquement depuis le build en fallback
      setSkills(FALLBACK_SKILLS);
    }

    load();
  }, []);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(skills.map((s) => s.category))).sort();
    return ['all', ...cats];
  }, [skills]);

  const tiers = ['all', 'core', 'community', 'learned', 'pro'];

  const filtered = useMemo(() => {
    return skills.filter((s) => {
      const matchSearch   = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase()) || s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
      const matchCategory = category === 'all' || s.category === category;
      const matchTier     = tier === 'all'     || s.tier     === tier;
      return matchSearch && matchCategory && matchTier;
    });
  }, [skills, search, category, tier]);

  async function handleInstall(name: string) {
    try {
      await fetch(`${QUEEN_URL}/api/marketplace/install`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      });
      setSkills((prev) => prev.map((s) => s.name === name ? { ...s, installed: true } : s));
    } catch { /* silencieux */ }
  }

  async function handleUninstall(name: string) {
    try {
      await fetch(`${QUEEN_URL}/api/marketplace/uninstall`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name }),
      });
      setSkills((prev) => prev.map((s) => s.name === name ? { ...s, installed: false } : s));
    } catch { /* silencieux */ }
  }

  return (
    <div style={{
      minHeight:  '100vh',
      background: '#0f1117',
      padding:    '24px 32px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '20px',
          }}>
            🧩
          </div>
          <div>
            <h1 style={{ color: 'white', fontSize: '22px', fontWeight: 700, margin: 0 }}>
              Skills Marketplace
            </h1>
            <p style={{ color: '#6b7280', fontSize: '13px', margin: '2px 0 0' }}>
              {skills.length} skills disponibles · {skills.filter((s) => s.installed).length} installés
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background:   'rgba(251,191,36,0.1)',
            border:       '1px solid rgba(251,191,36,0.3)',
            borderRadius: '8px',
            padding:      '8px 14px',
            color:        '#fbbf24',
            fontSize:     '12px',
            marginTop:    '8px',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Filtres */}
      <div style={{
        display:       'flex',
        gap:           '12px',
        marginBottom:  '24px',
        flexWrap:      'wrap',
        alignItems:    'center',
      }}>
        {/* Recherche */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un skill…"
          style={{
            flex:         '1',
            minWidth:     '200px',
            background:   'rgba(255,255,255,0.06)',
            border:       '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            color:        'white',
            fontSize:     '13px',
            padding:      '9px 14px',
            outline:      'none',
          }}
        />

        {/* Filtre catégorie */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{
            background:   'rgba(255,255,255,0.06)',
            border:       '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            color:        'white',
            fontSize:     '13px',
            padding:      '9px 12px',
            outline:      'none',
            cursor:       'pointer',
          }}
        >
          {categories.map((c) => (
            <option key={c} value={c} style={{ background: '#1a1d27' }}>
              {c === 'all' ? 'Toutes catégories' : c}
            </option>
          ))}
        </select>

        {/* Filtre tier */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {tiers.map((t) => {
            const cfg = t === 'all' ? null : TIER_CONFIG[t];
            return (
              <button
                key={t}
                onClick={() => setTier(t)}
                style={{
                  background:   tier === t ? (cfg?.bg ?? 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.04)',
                  border:       `1px solid ${tier === t ? (cfg?.color ?? 'rgba(255,255,255,0.3)') : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '6px',
                  color:        tier === t ? (cfg?.color ?? 'white') : '#6b7280',
                  fontSize:     '11px',
                  fontWeight:   600,
                  padding:      '5px 10px',
                  cursor:       'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {t === 'all' ? 'Tous' : `${cfg?.icon} ${t}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Compteur résultats */}
      {!loading && (
        <p style={{ color: '#4b5563', fontSize: '12px', marginBottom: '16px' }}>
          {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          {search ? ` pour "${search}"` : ''}
        </p>
      )}

      {/* Grille skills */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
          <p>Chargement…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7280' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: '#9ca3af' }}>Aucun skill trouvé</p>
          <p style={{ fontSize: '13px' }}>Essaie un autre filtre ou terme de recherche.</p>
        </div>
      ) : (
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap:                 '14px',
        }}>
          {filtered.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Fallback statique (si Queen non dispo) ───────────────────────────────────
// Reprend les skills core du registry pour permettre la navigation sans Queen.

const FALLBACK_SKILLS: Skill[] = [
  { name: 'accessibility_reader', description: "Lit l'arbre AX macOS et retourne tous les éléments UI sémantiques",                          version: '1.0.0', category: 'computer-use', author: 'chimera-core',      tier: 'core',      tags: ['accessibility','macos','semantic','ui'],             created: '2026-03-12T00:00:00.000Z' },
  { name: 'agent_bridge',         description: 'Pont ESM vers les couches Python de Chimera — envoie des missions à queen ou brain',          version: '1.0.0', category: 'integration',  author: 'chimera-core',      tier: 'core',      tags: ['bridge','python','mission'],                          created: '2026-03-12T00:00:00.000Z' },
  { name: 'find_element',         description: "Trouve un élément UI par description sémantique via l'arbre AX macOS",                        version: '1.0.0', category: 'computer-use', author: 'chimera-core',      tier: 'core',      tags: ['accessibility','semantic','find'],                     created: '2026-03-12T00:00:00.000Z' },
  { name: 'goto_url',             description: 'Ouvre une URL dans Safari',                                                                   version: '1.0.0', category: 'browser',      author: 'chimera-core',      tier: 'core',      tags: ['safari','url','navigation','browser'],                 created: '2026-03-12T00:00:00.000Z' },
  { name: 'http_fetch',           description: 'Fait un appel HTTP (GET/POST) et retourne le contenu texte',                                  version: '1.0.0', category: 'network',      author: 'chimera-core',      tier: 'core',      tags: ['http','fetch','get','post'],                           created: '2026-03-12T00:00:00.000Z' },
  { name: 'list_big_files',       description: 'Liste les N fichiers les plus lourds d\'un dossier',                                          version: '1.0.0', category: 'filesystem',   author: 'chimera-core',      tier: 'core',      tags: ['files','disk','size'],                                 created: '2026-03-12T00:00:00.000Z' },
  { name: 'open_app',             description: 'Ouvre une application macOS par son nom (Safari, VSCode, Terminal…)',                         version: '1.0.0', category: 'system',       author: 'chimera-core',      tier: 'core',      tags: ['macos','app','launch'],                               created: '2026-03-12T00:00:00.000Z' },
  { name: 'press_key',            description: 'Appuie sur une touche clavier (Return, Space, Tab, Escape…)',                                 version: '1.0.0', category: 'computer-use', author: 'chimera-core',      tier: 'core',      tags: ['keyboard','key','input'],                              created: '2026-03-12T00:00:00.000Z' },
  { name: 'read_file',            description: 'Lit un fichier local et retourne son contenu (max 8000 chars)',                               version: '1.0.0', category: 'filesystem',   author: 'chimera-core',      tier: 'core',      tags: ['file','read','filesystem'],                           created: '2026-03-12T00:00:00.000Z' },
  { name: 'run_command',          description: 'Exécute une commande shell sûre (ls, cat, git, npm, node, python3, curl)',                    version: '1.0.0', category: 'system',       author: 'chimera-core',      tier: 'core',      tags: ['shell','command','exec'],                              created: '2026-03-12T00:00:00.000Z' },
  { name: 'screen_elements',      description: "Analyse sémantique complète de l'écran: app, résolution, éléments UI groupés par rôle",      version: '1.0.0', category: 'computer-use', author: 'chimera-core',      tier: 'core',      tags: ['accessibility','semantic','screen','perception'],       created: '2026-03-12T00:00:00.000Z' },
  { name: 'smart_click',          description: 'Clique sur un élément UI par description sémantique',                                        version: '1.0.0', category: 'computer-use', author: 'chimera-core',      tier: 'core',      tags: ['accessibility','click','interaction'],                  created: '2026-03-12T00:00:00.000Z' },
  { name: 'take_screenshot',      description: "Prend une capture d'écran de l'écran macOS et retourne le chemin",                           version: '1.0.0', category: 'computer-use', author: 'chimera-core',      tier: 'core',      tags: ['screenshot','macos','capture'],                        created: '2026-03-12T00:00:00.000Z' },
  { name: 'telegram_notify',      description: 'Envoie un message Telegram via BOT_TOKEN + CHAT_ID',                                         version: '1.0.0', category: 'notification', author: 'chimera-core',      tier: 'core',      tags: ['telegram','notification','messaging'],                  created: '2026-03-12T00:00:00.000Z' },
  { name: 'type_text',            description: 'Tape du texte dans le champ actif via AppleScript',                                          version: '1.0.0', category: 'computer-use', author: 'chimera-core',      tier: 'core',      tags: ['keyboard','text','input','applescript'],               created: '2026-03-12T00:00:00.000Z' },
  { name: 'wait_for_element',     description: "Attend qu'un élément UI apparaisse avec polling AX tree et timeout",                         version: '1.0.0', category: 'computer-use', author: 'chimera-core',      tier: 'core',      tags: ['accessibility','wait','synchronization'],              created: '2026-03-12T00:00:00.000Z' },
  { name: 'open_google',          description: 'Ouvre https://google.com dans Safari',                                                        version: '1.0.0', category: 'browser',      author: 'claude-architecte', tier: 'learned',   tags: ['google','safari','browser','url'],                     created: '2026-03-13T04:48:18.000Z' },
  { name: 'mouse_control',        description: 'Contrôle la souris macOS via Python Quartz CoreGraphics — déplacer, cliquer, cercle demo',   version: '1.0.0', category: 'computer-use', author: 'claude-architecte', tier: 'learned',   tags: ['mouse','macos','quartz','hid'],                        created: '2026-03-13T23:35:53.000Z' },
  { name: 'summarize_project',    description: "Génère un résumé de la structure d'un projet (arbre, package.json, README)",                  version: '1.0.0', category: 'analysis',     author: 'chimera-core',      tier: 'core',      tags: ['project','summary','structure'],                       created: '2026-03-12T00:00:00.000Z' },
  { name: 'invoke_claude_code',   description: 'Lance Claude Code en mode non-interactif depuis le terminal',                                version: '1.0.0', category: 'integration',  author: 'claude-architecte', tier: 'learned',   tags: ['claude-code','mcp','non-interactive'],                  created: '2026-03-13T08:48:08.000Z' },
];
