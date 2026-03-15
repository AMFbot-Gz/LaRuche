/**
 * api/computer_use_routes.js — Endpoints HTTP pour Computer Use Loop
 *
 * Routes :
 *   POST   /api/computer-use/start        — Démarre une session
 *   GET    /api/computer-use/sessions     — Liste les sessions actives
 *   DELETE /api/computer-use/sessions/:id — Annule une session
 */

/**
 * @param {import('hono').Hono} app
 * @param {{ computerUseLoop: import('../services/computer_use_loop.js').ComputerUseLoop }} deps
 */
export function createComputerUseRoutes(app, { computerUseLoop }) {
  // POST /api/computer-use/start
  app.post('/api/computer-use/start', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Corps JSON invalide' }, 400);
    }

    const { goal, workspaceId, options } = body;
    if (!goal) return c.json({ error: 'goal requis' }, 400);

    const sessionId = `cu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Lance en arrière-plan (non-blocking)
    computerUseLoop.start(sessionId, goal, { workspaceId, ...options })
      .catch(err => console.error('[ComputerUse] Session error:', err));

    return c.json({ sessionId, status: 'started', message: 'Session Computer Use démarrée' });
  });

  // GET /api/computer-use/sessions
  app.get('/api/computer-use/sessions', (c) => {
    return c.json({ sessions: computerUseLoop.getActiveSessions() });
  });

  // DELETE /api/computer-use/sessions/:id
  app.delete('/api/computer-use/sessions/:id', (c) => {
    const id = c.req.param('id');
    computerUseLoop.cancel(id);
    return c.json({ cancelled: true, sessionId: id });
  });
}
