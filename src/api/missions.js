/**
 * src/api/missions.js — API REST pour les missions LaRuche
 * Endpoints : POST /api/mission, GET /api/missions, GET /api/missions/:id
 *             GET /api/status, GET /api/agents, POST /api/search
 *
 * Compatible avec le mode Standalone ET le mode Telegram.
 * Les routes sont enregistrées sur une app Hono existante.
 */

import { randomUUID } from "crypto";

// ─── Store in-memory des missions en cours ─────────────────────────────────────
// missionId → { id, command, status, result, events, startedAt }
export const activeMissions = new Map();

// Durée de rétention des missions terminées dans le store in-memory (5 min)
const RETENTION_MS = 5 * 60 * 1000;

/**
 * Crée une entrée de mission in-memory
 */
export function createMissionEntry(command) {
  const id = `m-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const entry = {
    id,
    command,
    status: "pending",
    result: null,
    error: null,
    events: [],
    models: [],
    duration: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  activeMissions.set(id, entry);
  return entry;
}

/**
 * Met à jour le statut d'une mission in-memory
 */
export function updateMission(id, patch) {
  const entry = activeMissions.get(id);
  if (!entry) return;
  Object.assign(entry, patch);

  // Nettoyage différé après rétention
  if (patch.status === "success" || patch.status === "error") {
    setTimeout(() => activeMissions.delete(id), RETENTION_MS);
  }
}

/**
 * Ajoute un événement à la timeline d'une mission
 */
export function appendMissionEvent(id, event) {
  const entry = activeMissions.get(id);
  if (!entry) return;
  entry.events.push({ ...event, ts: new Date().toISOString() });
}

// ─── Enregistrement des routes sur une app Hono ────────────────────────────────

/**
 * @param {import('hono').Hono} app
 * @param {{
 *   loadMissions: () => Object[],
 *   saveMission: (entry: Object) => void,
 *   runMission: (command: string, missionId: string) => Promise<string>,
 *   autoDetectRoles: () => Promise<Object>,
 *   broadcastHUD: (event: Object) => void,
 *   logger: import('winston').Logger,
 * }} deps
 */
export function createMissionsRoutes(app, deps) {
  const { loadMissions, runMission, autoDetectRoles, broadcastHUD, logger } = deps;

  // ─── POST /api/mission ──────────────────────────────────────────────────────
  app.post("/api/mission", async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Body JSON invalide" }, 400);
    }

    const command = body?.command?.trim();
    if (!command) {
      return c.json({ error: "Champ 'command' requis" }, 400);
    }
    if (command.length > 2000) {
      return c.json({ error: "Commande trop longue (max 2000 caractères)" }, 400);
    }

    const entry = createMissionEntry(command);
    logger.info(`[API] Nouvelle mission ${entry.id}: ${command.substring(0, 60)}`);
    broadcastHUD({ type: "mission_start", command: command.substring(0, 100), missionId: entry.id });

    // Exécution asynchrone — on retourne immédiatement le missionId
    runMission(command, entry.id).catch((err) => {
      logger.error(`[API] Mission ${entry.id} erreur: ${err.message}`);
    });

    return c.json({ missionId: entry.id, status: "pending" }, 202);
  });

  // ─── GET /api/missions ──────────────────────────────────────────────────────
  app.get("/api/missions", (c) => {
    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
    const offset = (page - 1) * limit;

    const all = loadMissions();
    const total = all.length;
    const missions = all.slice(offset, offset + limit);

    return c.json({ missions, total, page, limit });
  });

  // ─── GET /api/missions/:id ──────────────────────────────────────────────────
  app.get("/api/missions/:id", (c) => {
    const id = c.req.param("id");

    // D'abord chercher dans le store in-memory (missions en cours)
    const active = activeMissions.get(id);
    if (active) return c.json(active);

    // Sinon chercher dans l'historique persisté
    const missions = loadMissions();
    const mission = missions.find((m) => m.id === id);
    if (!mission) return c.json({ error: "Mission introuvable" }, 404);

    return c.json(mission);
  });

  // ─── GET /api/status ────────────────────────────────────────────────────────
  app.get("/api/status", async (c) => {
    let ollamaOk = false;
    let ollamaLatencyMs = null;
    const ollamaHost = process.env.OLLAMA_HOST || "http://localhost:11434";

    try {
      const t = Date.now();
      const r = await fetch(`${ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      ollamaOk = r.ok;
      ollamaLatencyMs = Date.now() - t;
    } catch {}

    const missions = loadMissions();
    const successCount = missions.filter((m) => m.status === "success").length;
    const activeMissionCount = activeMissions.size;

    let roles = {};
    try {
      roles = await autoDetectRoles();
    } catch {}

    return c.json({
      status: "online",
      mode: "standalone",
      version: process.env.npm_package_version || "3.2.0",
      uptime: Math.floor(process.uptime()),
      ollama: {
        ok: ollamaOk,
        latencyMs: ollamaLatencyMs,
        host: ollamaHost,
      },
      missions: {
        total: missions.length,
        success: successCount,
        active: activeMissionCount,
      },
      models: roles,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── GET /api/agents ────────────────────────────────────────────────────────
  app.get("/api/agents", async (c) => {
    let roles = {};
    try {
      roles = await autoDetectRoles();
    } catch {}

    const agents = Object.entries(roles).map(([role, model]) => ({
      role,
      model,
      status: model ? "active" : "unavailable",
    }));

    return c.json({ agents });
  });

  // ─── POST /api/search ────────────────────────────────────────────────────────
  app.post("/api/search", async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Body JSON invalide" }, 400);
    }

    const query = body?.query?.trim();
    if (!query) return c.json({ error: "Champ 'query' requis" }, 400);

    // Recherche simple par correspondance textuelle dans l'historique
    const missions = loadMissions();
    const results = missions
      .filter((m) => m.command?.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10)
      .map((m) => ({
        id: m.id,
        command: m.command,
        status: m.status,
        score: 1.0, // Simple match — ChromaDB optionnel
        ts: m.ts || m.startedAt,
      }));

    return c.json({ query, results, count: results.length });
  });

  // ─── GET /api/health ─────────────────────────────────────────────────────────
  app.get("/api/health", (c) => {
    return c.json({ ok: true, ts: Date.now() });
  });
}
