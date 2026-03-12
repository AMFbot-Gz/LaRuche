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
      version: process.env.npm_package_version || "4.1.0",
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

    const AGENT_META = {
      strategist:  { name: "Stratège",      icon: "🧠", color: "#6366f1" },
      architect:   { name: "Architecte",    icon: "⚡", color: "#3b82f6" },
      worker:      { name: "Ouvrière",      icon: "🔧", color: "#f59e0b" },
      vision:      { name: "Vision",        icon: "👁",  color: "#10b981" },
      visionFast:  { name: "Vision Rapide", icon: "📷", color: "#06b6d4" },
      synthesizer: { name: "Synthèse",      icon: "✨", color: "#8b5cf6" },
    };
    const recent = loadMissions().slice(0, 1);
    const lastTask = recent[0]?.command?.substring(0, 50) || "En attente...";
    const isRunning = activeMissions.size > 0;
    const agents = Object.entries(AGENT_META).map(([id, meta]) => ({
      id,
      ...meta,
      model: roles[id] || null,
      status: roles[id] ? (isRunning ? "running" : "idle") : "unavailable",
      tokensPerSec: 0,
      lastTask,
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

  // ─── GET /api/system ─────────────────────────────────────────────────────────
  app.get("/api/system", async (c) => {
    try {
      const si = await import("systeminformation");
      const [cpu, mem, disk, proc] = await Promise.all([
        si.default.currentLoad(),
        si.default.mem(),
        si.default.fsSize(),
        si.default.processes(),
      ]);
      const ollamaProc = proc.list?.filter(p => p.name?.toLowerCase().includes("ollama")) || [];
      return c.json({
        cpu: { load: Math.round(cpu.currentLoad) },
        memory: {
          total: mem.total,
          used: mem.used,
          free: mem.free,
          percent: Math.round((mem.used / mem.total) * 100),
        },
        disk: disk.slice(0, 2).map(d => ({
          fs: d.fs, size: d.size, used: d.used,
          percent: Math.round(d.use),
        })),
        ollama: { running: ollamaProc.length > 0 },
      });
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── GET /api/logs ───────────────────────────────────────────────────────────
  app.get("/api/logs", async (c) => {
    const lines = parseInt(c.req.query("lines") || "100", 10);
    try {
      const { readFileSync, existsSync } = await import("fs");
      const logFile = "/tmp/queen.log";
      let raw = existsSync(logFile) ? readFileSync(logFile, "utf-8") : "";
      const allLines = raw.split("\n").filter(Boolean);
      const recent = allLines.slice(-lines);
      return c.json({ lines: recent, total: allLines.length });
    } catch {
      return c.json({ lines: [], total: 0 });
    }
  });

  // ─── GET /api/skills ─────────────────────────────────────────────────────────
  app.get("/api/skills", async (c) => {
    try {
      const { readFileSync, existsSync, readdirSync, statSync } = await import("fs");
      const { join } = await import("path");
      const SKILLS_DIR = join(process.cwd(), "skills");
      if (!existsSync(SKILLS_DIR)) return c.json({ skills: [] });
      const dirs = readdirSync(SKILLS_DIR).filter(d => {
        try { return statSync(join(SKILLS_DIR, d)).isDirectory(); } catch { return false; }
      });
      const skills = dirs.map(d => {
        try {
          const m = JSON.parse(readFileSync(join(SKILLS_DIR, d, "manifest.json"), "utf-8"));
          const hasSkill = existsSync(join(SKILLS_DIR, d, "skill.js"));
          return { ...m, name: d, hasSkill };
        } catch { return { name: d, description: "No manifest" }; }
      });
      return c.json({ skills });
    } catch (e) { return c.json({ skills: [], error: e.message }); }
  });

  // ─── POST /api/skills/:name/run ──────────────────────────────────────────────
  app.post("/api/skills/:name/run", async (c) => {
    const name = c.req.param("name");
    let params = {};
    try { params = await c.req.json(); } catch {}
    try {
      const { runSkill } = await import("../skill_runner.js");
      const result = await runSkill(name, params);
      return c.json({ success: true, result });
    } catch (e) { return c.json({ success: false, error: e.message }, 400); }
  });

  // ─── DELETE /api/skills/:name ─────────────────────────────────────────────────
  app.delete("/api/skills/:name", async (c) => {
    const name = c.req.param("name");
    try {
      const { rmSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const dir = join(process.cwd(), "skills", name);
      if (!existsSync(dir)) return c.json({ error: "Skill introuvable" }, 404);
      rmSync(dir, { recursive: true, force: true });
      return c.json({ success: true });
    } catch (e) { return c.json({ success: false, error: e.message }, 500); }
  });

  // ─── GET /api/config ─────────────────────────────────────────────────────────
  app.get("/api/config", async (c) => {
    try {
      const { readFileSync, existsSync } = await import("fs");
      const { join } = await import("path");
      // .env (masquer les tokens)
      const envPath = join(process.cwd(), ".env");
      let envVars = {};
      if (existsSync(envPath)) {
        readFileSync(envPath, "utf-8").split("\n").forEach(line => {
          const [k, ...v] = line.split("=");
          if (k?.trim() && !k.startsWith("#")) {
            const val = v.join("=").trim();
            const isSensitive = /token|key|secret|password/i.test(k);
            envVars[k.trim()] = isSensitive && val ? "***" : val;
          }
        });
      }
      // .laruche/config.json
      const cfgPath = join(process.cwd(), ".laruche/config.json");
      const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf-8")) : {};
      return c.json({ env: envVars, config: cfg });
    } catch (e) { return c.json({ error: e.message }, 500); }
  });

  // ─── POST /api/mission/:id/cancel ────────────────────────────────────────────
  app.post("/api/mission/:id/cancel", (c) => {
    const id = c.req.param("id");
    const m = activeMissions.get(id);
    if (!m) return c.json({ error: "Mission introuvable" }, 404);
    if (m.status !== "pending" && m.status !== "running") {
      return c.json({ error: "Mission déjà terminée" }, 400);
    }
    updateMission(id, { status: "cancelled", completedAt: new Date().toISOString() });
    broadcastHUD({ type: "mission_cancelled", missionId: id });
    return c.json({ success: true });
  });

  // ─── POST /api/agent ─────────────────────────────────────────────────────────
  // Lance un agent nommé directement: { agent: "architect", task: "..." }
  app.post("/api/agent", async (c) => {
    let body;
    try { body = await c.req.json(); } catch {
      return c.json({ error: "Body JSON invalide" }, 400);
    }
    const { agent = "worker", task } = body || {};
    if (!task?.trim()) return c.json({ error: "Champ 'task' requis" }, 400);

    try {
      const { runAgent } = await import("../agents/agentOrchestrator.js");
      const hudEvents = [];
      const result = await runAgent(agent, task.trim(), {
        hudFn: (ev) => {
          hudEvents.push(ev);
          broadcastHUD({ ...ev, agent });
        },
      });
      return c.json({ success: result.status !== "error", agent, task, result, events: hudEvents });
    } catch (e) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  // ─── POST /api/orchestrate ───────────────────────────────────────────────────
  // Lance N agents en parallèle: { mission: "...", maxParallel: 4 }
  app.post("/api/orchestrate", async (c) => {
    let body;
    try { body = await c.req.json(); } catch {
      return c.json({ error: "Body JSON invalide" }, 400);
    }
    const { mission, maxParallel = 4, forceKimi = false, useAgentLoop = false } = body || {};
    if (!mission?.trim()) return c.json({ error: "Champ 'mission' requis" }, 400);

    const entry = createMissionEntry(mission.trim());
    broadcastHUD({ type: "mission_start", command: mission.slice(0, 100), missionId: entry.id });

    // Exécution asynchrone
    import("../agents/agentOrchestrator.js").then(({ orchestrate }) => {
      updateMission(entry.id, { status: "running" });
      return orchestrate(mission.trim(), {
        maxParallel,
        forceKimi,
        useAgentLoop,
        hudFn: (ev) => {
          broadcastHUD({ ...ev, missionId: entry.id });
          appendMissionEvent(entry.id, ev);
        },
      });
    }).then(result => {
      updateMission(entry.id, {
        status: result.success ? "success" : "partial",
        result: result.response,
        duration: result.duration,
        completedAt: new Date().toISOString(),
      });
      broadcastHUD({ type: "mission_complete", duration: result.duration, missionId: entry.id });
    }).catch(err => {
      logger.error(`[API] Orchestrate ${entry.id} erreur: ${err.message}`);
      updateMission(entry.id, { status: "error", error: err.message, completedAt: new Date().toISOString() });
    });

    return c.json({ missionId: entry.id, status: "pending" }, 202);
  });

  // ─── GET /api/agents/:name ────────────────────────────────────────────────────
  // Détails d'une config d'agent YAML
  app.get("/api/agents/:name", async (c) => {
    const name = c.req.param("name");
    try {
      const { readFileSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const configPath = join(process.cwd(), `config/agents/${name}.yaml`);
      if (!existsSync(configPath)) return c.json({ error: "Agent config introuvable" }, 404);
      const raw = readFileSync(configPath, "utf-8");
      return c.json({ name, config: raw });
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── GET /api/memory ─────────────────────────────────────────────────────────
  // Stats de la mémoire apprise + top routes
  app.get("/api/memory", async (c) => {
    try {
      const { memoryStats } = await import("../learning/missionMemory.js");
      return c.json(memoryStats());
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });

  // ─── DELETE /api/memory/forget ───────────────────────────────────────────────
  // Oublie une route apprise : { command: "..." }
  app.delete("/api/memory/forget", async (c) => {
    let body;
    try { body = await c.req.json(); } catch { return c.json({ error: "Body JSON invalide" }, 400); }
    if (!body?.command) return c.json({ error: "Champ 'command' requis" }, 400);
    const { forget } = await import("../learning/missionMemory.js");
    const removed = forget(body.command);
    return c.json({ success: removed, message: removed ? `Route oubliée` : `Aucune route trouvée` });
  });

  // ─── POST /api/process/restart ───────────────────────────────────────────────
  app.post("/api/process/restart", async (c) => {
    // On broadcaste l'event puis on schedule un restart dans 1s
    broadcastHUD({ type: "system_restart", message: "Redémarrage planifié dans 1s..." });
    setTimeout(() => {
      process.exit(0); // PM2 / superviseur relancera
    }, 1000);
    return c.json({ success: true, message: "Redémarrage en cours..." });
  });
}
