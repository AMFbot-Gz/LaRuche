/**
 * api/hitl_routes.js — Endpoints HTTP pour la Conscience HITL
 *
 * Routes :
 *   POST /api/hitl/:requestId/respond  — Approuver ou refuser une demande
 *   GET  /api/hitl/pending             — Lister les demandes en attente
 *
 * Usage depuis le terminal (MVP) :
 *   # Approuver
 *   curl -X POST http://localhost:3000/api/hitl/<requestId>/respond \
 *        -H "Content-Type: application/json" \
 *        -d '{"approved": true}'
 *
 *   # Refuser avec message
 *   curl -X POST http://localhost:3000/api/hitl/<requestId>/respond \
 *        -H "Content-Type: application/json" \
 *        -d '{"approved": false, "answer": "Trop risqué"}'
 *
 *   # Lister les demandes en attente
 *   curl http://localhost:3000/api/hitl/pending
 *
 * Sécurité :
 *   - requestId validé (UUID format)
 *   - Body size limité (pas de DoS par payload géant)
 *   - respond() idempotent — 404 si requestId inconnu/expiré
 */

import { hitlManager } from '../core/hitl_manager.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Enregistre les routes HITL sur l'application Hono.
 * @param {import('hono').Hono} app
 */
export function registerHitlRoutes(app) {

  // ── POST /api/hitl/:requestId/respond ───────────────────────────────────────
  app.post('/api/hitl/:requestId/respond', async (c) => {
    const { requestId } = c.req.param();

    // Validation UUID
    if (!UUID_RE.test(requestId)) {
      return c.json({ error: 'requestId invalide (UUID attendu)' }, 400);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Body JSON invalide' }, 400);
    }

    const { approved, answer = null } = body;

    if (typeof approved !== 'boolean') {
      return c.json({ error: 'approved (boolean) requis dans le body' }, 400);
    }
    if (answer !== null && typeof answer !== 'string') {
      return c.json({ error: 'answer doit être une string ou null' }, 400);
    }

    const ok = hitlManager.respond(requestId, approved, answer ?? null);

    if (!ok) {
      return c.json({
        error: 'Demande HITL introuvable — expirée ou déjà résolue',
        requestId,
      }, 404);
    }

    return c.json({
      ok:        true,
      requestId,
      approved,
      answer,
      ts:        Date.now(),
    });
  });

  // ── GET /api/hitl/pending ───────────────────────────────────────────────────
  app.get('/api/hitl/pending', (c) => {
    const requests = hitlManager.getPending();
    return c.json({
      pending: requests,
      count:   requests.length,
      ts:      Date.now(),
    });
  });

  // ── GET /api/hitl/status ────────────────────────────────────────────────────
  app.get('/api/hitl/status', (c) => {
    return c.json({
      enabled:        process.env.HITL_MODE !== 'disabled',
      mode:           process.env.HITL_MODE || 'auto',
      threshold:      parseFloat(process.env.HITL_THRESHOLD || '0.7'),
      timeout_sec:    parseInt(process.env.HITL_TIMEOUT_SEC || '120'),
      pending_count:  hitlManager.pendingCount(),
      auto_approve:   process.env.HITL_AUTO_APPROVE === 'true',
      auto_reject:    process.env.HITL_AUTO_REJECT === 'true',
      ts:             Date.now(),
    });
  });
}
