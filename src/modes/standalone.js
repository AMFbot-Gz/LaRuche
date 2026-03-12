/**
 * src/modes/standalone.js — Mode sans Telegram
 * LaRuche v3.2 — Standalone API Server
 *
 * Démarre un serveur HTTP Hono sur API_PORT (défaut 3000).
 * Tous les endpoints sont disponibles via REST.
 * Les mises à jour temps réel passent par le WebSocket HUD (port 9001).
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createMissionsRoutes } from "../api/missions.js";

/**
 * Lance le serveur API standalone
 *
 * @param {{
 *   loadMissions: () => Object[],
 *   saveMission: (entry: Object) => void,
 *   runMission: (command: string, missionId: string) => Promise<string>,
 *   autoDetectRoles: () => Promise<Object>,
 *   broadcastHUD: (event: Object) => void,
 *   logger: import('winston').Logger,
 * }} deps
 * @returns {{ app: Hono, server: import('http').Server }}
 */
export function startStandaloneServer(deps) {
  const { logger } = deps;
  const port = parseInt(process.env.API_PORT || "3000", 10);

  const app = new Hono();

  // ─── CORS ──────────────────────────────────────────────────────────────────
  app.use("*", async (c, next) => {
    c.res.headers.set("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
    c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (c.req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: c.res.headers });
    }
    await next();
  });

  // ─── Routes missions ────────────────────────────────────────────────────────
  createMissionsRoutes(app, deps);

  // ─── Route racine ───────────────────────────────────────────────────────────
  app.get("/", (c) =>
    c.json({
      name: "LaRuche API",
      version: process.env.npm_package_version || "3.2.0",
      mode: "standalone",
      endpoints: [
        "POST /api/mission",
        "GET  /api/missions",
        "GET  /api/missions/:id",
        "GET  /api/status",
        "GET  /api/agents",
        "POST /api/search",
        "GET  /api/health",
        "GET  /api/system",
        "GET  /api/logs",
        "GET  /api/skills",
        "POST /api/skills/:name/run",
        "DELETE /api/skills/:name",
        "GET  /api/config",
        "POST /api/mission/:id/cancel",
        "POST /api/process/restart",
      ],
    })
  );

  // ─── 404 catch-all ─────────────────────────────────────────────────────────
  app.notFound((c) => c.json({ error: "Route introuvable" }, 404));

  // ─── Démarrage ──────────────────────────────────────────────────────────────
  const server = serve({ fetch: app.fetch, port }, () => {
    logger.info(`🌐 API Standalone: http://localhost:${port}`);
    logger.info(`📖 Endpoints: http://localhost:${port}/`);
  });

  return { app, server };
}

/**
 * Vérifie si le mode standalone est activé
 */
export function isStandaloneMode() {
  return process.env.STANDALONE_MODE === "true" || process.env.STANDALONE_MODE === "1";
}
