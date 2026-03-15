/**
 * api/marketplace.js — Endpoints HTTP pour le Marketplace de Skills Chimera
 *
 * Routes :
 *   GET    /api/marketplace/skills?q=screenshot  — Rechercher des skills
 *   POST   /api/marketplace/skills/:id/install   — Installer un skill
 *   POST   /api/marketplace/skills/publish       — Publier un skill local
 *   DELETE /api/marketplace/skills/:id           — Désinstaller un skill
 *
 * Usage depuis le terminal :
 *   # Recherche
 *   curl "http://localhost:3000/api/marketplace/skills?q=screenshot"
 *
 *   # Installer un skill depuis le registry
 *   curl -X POST http://localhost:3000/api/marketplace/skills/take_screenshot/install
 *
 *   # Installer depuis une source locale
 *   curl -X POST http://localhost:3000/api/marketplace/skills/my_skill/install \
 *        -H "Content-Type: application/json" \
 *        -d '{"source": "/absolute/path/to/skill_dir"}'
 *
 *   # Publier un skill local
 *   curl -X POST http://localhost:3000/api/marketplace/skills/publish \
 *        -H "Content-Type: application/json" \
 *        -d '{"skill_dir": "/absolute/path/to/skill_dir"}'
 *
 *   # Désinstaller
 *   curl -X DELETE http://localhost:3000/api/marketplace/skills/my_skill
 *
 * Sécurité :
 *   - skill_id validé (snake_case, max 40 chars) — protection path traversal
 *   - source et skill_dir limités aux chemins absolus
 *   - Désinstallation uniquement possible depuis skills/installed/ (pas core/)
 */

import { SkillsMarketplace, SkillValidator } from '../../../../packages/marketplace/src/index.js';

// Instance singleton du marketplace (réutilisée entre requêtes)
let _marketplace = null;

function getMarketplace() {
  if (!_marketplace) {
    _marketplace = new SkillsMarketplace();
  }
  return _marketplace;
}

const validator    = new SkillValidator();
const SKILL_ID_RE  = /^[a-z0-9_]{1,40}$/;

/**
 * Enregistre les routes Marketplace sur l'application Hono.
 * @param {import('hono').Hono} app
 */
export function registerMarketplaceRoutes(app) {

  // ── GET /api/marketplace/skills ────────────────────────────────────────────
  // Recherche dans le registry par texte libre, tier ou version minimale.
  // Query params : q (texte), tier, version_min
  app.get('/api/marketplace/skills', (c) => {
    const q           = c.req.query('q')           || '';
    const tier        = c.req.query('tier')        || '';
    const version_min = c.req.query('version_min') || '';

    const filters = {};
    if (tier)        filters.tier        = tier;
    if (version_min) filters.version_min = version_min;

    const mp      = getMarketplace();
    const results = mp.search(q, filters);
    const stats   = mp.getStats();

    return c.json({
      ok:      true,
      query:   q,
      filters,
      count:   results.length,
      skills:  results,
      stats,
      ts:      Date.now(),
    });
  });

  // ── POST /api/marketplace/skills/:id/install ───────────────────────────────
  // Installe un skill depuis le registry (stub) ou depuis une source locale.
  // Body optionnel : { source: "/chemin/absolu/vers/dossier" }
  app.post('/api/marketplace/skills/:id/install', async (c) => {
    const skill_id = c.req.param('id');

    // Validation du nom
    if (!SKILL_ID_RE.test(skill_id)) {
      return c.json({
        error: 'skill_id invalide — doit être snake_case alphanumérique (max 40 chars)',
        skill_id,
      }, 400);
    }

    let source = null;
    try {
      const body = await c.req.json().catch(() => ({}));
      source = body?.source || null;
    } catch { /* body absent ou non-JSON → source reste null */ }

    // Sécurité : la source doit être un chemin absolu si fournie
    if (source && !source.startsWith('/')) {
      return c.json({ error: 'source doit être un chemin absolu' }, 400);
    }

    const result = await getMarketplace().install(skill_id, source);

    if (!result.success) {
      return c.json({ ok: false, ...result }, result.errors ? 400 : 500);
    }

    return c.json({ ok: true, ...result, ts: Date.now() });
  });

  // ── POST /api/marketplace/skills/publish ───────────────────────────────────
  // Publie un skill local dans le registry Chimera.
  // Requiert manifest.json + skill.js dans le dossier cible.
  // Body : { skill_dir: "/chemin/absolu/vers/dossier" }
  app.post('/api/marketplace/skills/publish', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Body JSON invalide' }, 400);
    }

    const { skill_dir } = body;

    if (!skill_dir || typeof skill_dir !== 'string') {
      return c.json({ error: 'skill_dir (string) requis dans le body' }, 400);
    }

    // Sécurité : chemin absolu uniquement
    if (!skill_dir.startsWith('/')) {
      return c.json({ error: 'skill_dir doit être un chemin absolu' }, 400);
    }

    const result = getMarketplace().publish(skill_dir);

    if (!result.success) {
      return c.json({ ok: false, ...result }, result.errors ? 400 : 500);
    }

    return c.json({ ok: true, ...result, ts: Date.now() });
  });

  // ── DELETE /api/marketplace/skills/:id ────────────────────────────────────
  // Désinstalle un skill depuis skills/installed/.
  // Les skills core (skills/core/) ne sont pas accessibles via cette route.
  app.delete('/api/marketplace/skills/:id', (c) => {
    const skill_id = c.req.param('id');

    // Validation du nom
    if (!SKILL_ID_RE.test(skill_id)) {
      return c.json({
        error: 'skill_id invalide — doit être snake_case alphanumérique (max 40 chars)',
        skill_id,
      }, 400);
    }

    const result = getMarketplace().uninstall(skill_id);

    if (!result.success) {
      const status = result.error?.includes('non trouvé') ? 404 : 400;
      return c.json({ ok: false, ...result }, status);
    }

    return c.json({ ok: true, ...result, ts: Date.now() });
  });
}
