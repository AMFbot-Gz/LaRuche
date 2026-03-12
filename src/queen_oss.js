/**
 * queen_oss.js — LaRuche Queen Open Source Edition v4.1
 * Intègre: callLLM (retry), Mission struct, logger centralisé, HUD token auth
 *
 * Modes:
 *   - Normal     : Telegram bot (TELEGRAM_BOT_TOKEN requis)
 *   - Standalone : API REST HTTP sur API_PORT (STANDALONE_MODE=true)
 */

import { Telegraf } from "telegraf";
import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { ask, autoDetectRoles, printRoles } from "./model_router.js";
import { callLLM } from "./llm/callLLM.js";
import { createMission, updateMissionState, addMissionStep, addModelUsed, finalizeMission, missionSummary } from "./types/mission.js";
import { logger } from "./utils/logger.js";
import { startCronRunner } from "./cron_runner.js";
import { isStandaloneMode, startStandaloneServer } from "./modes/standalone.js";
import { updateMission, appendMissionEvent } from "./api/missions.js";

dotenv.config();

// ─── Chemins et Constantes ─────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MISSIONS_FILE = join(ROOT, ".laruche/missions.json");
const STANDALONE = isStandaloneMode();

// ─── Validation de la Config ───────────────────────────────────────────────────────────────
const CONFIG = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_ID: process.env.ADMIN_TELEGRAM_ID,
  HUD_PORT: parseInt(process.env.HUD_PORT || "9001", 10),
  HUD_TOKEN: process.env.HUD_TOKEN || null,  // token optionnel pour sécuriser le WebSocket HUD
};

if (!STANDALONE) {
  if (!CONFIG.TELEGRAM_TOKEN) {
    logger.error("TELEGRAM_BOT_TOKEN manquant (requis hors mode standalone)");
    process.exit(1);
  }
  if (!CONFIG.ADMIN_ID) {
    logger.error("ADMIN_TELEGRAM_ID manquant (requis hors mode standalone)");
    process.exit(1);
  }
}

// ─── Missions (Cache + Persistance) ────────────────────────────────────────────────────────
let _missionsCache = null;
let _missionsCacheTs = 0;
const MISSIONS_CACHE_TTL_MS = 30_000;

export function loadMissions() {
  if (_missionsCache && Date.now() - _missionsCacheTs < MISSIONS_CACHE_TTL_MS) return _missionsCache;
  try {
    const dir = join(ROOT, ".laruche");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    _missionsCache = existsSync(MISSIONS_FILE)
      ? JSON.parse(readFileSync(MISSIONS_FILE, "utf-8"))
      : [];
    _missionsCacheTs = Date.now();
  } catch (err) {
    logger.error(`Erreur chargement missions: ${err.message}`);
    _missionsCache = [];
    _missionsCacheTs = Date.now();
  }
  return _missionsCache;
}

export function saveMission(entry) {
  _missionsCache = [entry, ...loadMissions()].slice(0, 200);
  _missionsCacheTs = Date.now(); // Réinitialise le TTL après écriture
  try {
    writeFileSync(MISSIONS_FILE, JSON.stringify(_missionsCache, null, 2));
  } catch (err) {
    logger.error(`Erreur sauvegarde mission: ${err.message}`);
  }
}

// ─── Utilitaires ────────────────────────────────────────────────────────────────────────────
export const splitMsg = (text, max = 3900) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += max) chunks.push(text.slice(i, i + max));
  return chunks.length ? chunks : [text];
};

export const safeParseJSON = (text, fallback) => {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : fallback;
  } catch {
    return fallback;
  }
};

// ─── HUD Service (WebSocket) ──────────────────────────────────────────────────────────────────
// IMPORTANT: Le serveur WS est créé dans startHUDServer() (appelé en bas du fichier,
// après la validation config) pour éviter un EADDRINUSE silencieux au démarrage.
const hudClients = new Set();
let wss = null;

function startHUDServer() {
  const server = new WebSocketServer({ port: CONFIG.HUD_PORT });

  // Gestion explicite EADDRINUSE — évite un crash non catchable (event "error" non bindé)
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger.warn(`HUD: Port ${CONFIG.HUD_PORT} déjà utilisé — WebSocket HUD désactivé (HUD Electron déjà actif?)`);
    } else {
      logger.error(`HUD: Erreur WebSocketServer: ${err.message}`);
    }
  });

  server.on("connection", (ws, req) => {
    // Auth optionnelle via ?token=... si HUD_TOKEN est défini
    if (CONFIG.HUD_TOKEN) {
      try {
        const url = new URL(req.url, `http://localhost:${CONFIG.HUD_PORT}`);
        const token = url.searchParams.get("token");
        if (token !== CONFIG.HUD_TOKEN) {
          ws.close(4001, "Unauthorized");
          return;
        }
      } catch {
        ws.close(4001, "Unauthorized");
        return;
      }
    }
    hudClients.add(ws);
    logger.info(`HUD: Client connecté (${hudClients.size})`);
    ws.on("close", () => hudClients.delete(ws));
  });

  return server;
}

export function broadcastHUD(event) {
  const msg = JSON.stringify({ ...event, ts: Date.now() });
  hudClients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// ─── Butterfly Loop (Cœur IA) v4.1 ────────────────────────────────────────────────────────────
/**
 * @param {string} command
 * @param {Function} replyFn
 * @param {string|null} missionId
 */
export async function butterflyLoop(command, replyFn = async () => {}, missionId = null) {
  // Mission struct immuable
  let mission = createMission({
    id: missionId || undefined,
    command,
    source: missionId ? 'standalone' : 'telegram',
  });
  mission = updateMissionState(mission, { status: 'running' });

  logger.info(`🧸 Mission: ${command.substring(0, 80)}`, { mission_id: mission.id });
  broadcastHUD({ type: "mission_start", command: command.substring(0, 100), missionId: mission.id });

  if (missionId) updateMission(missionId, { status: "running" });

  const roles = await autoDetectRoles();

  try {
    // 1. Stratégie
    await replyFn(`🧠 Analyse stratégique avec **${roles.strategist}**...`, { parse_mode: "Markdown" });
    broadcastHUD({ type: "thinking", agent: "Stratège", thought: "Planification...", missionId: mission.id });
    if (missionId) appendMissionEvent(missionId, { type: "thinking", agent: "strategist" });

    const planPrompt = `Tu es le stratège de LaRuche.
Mission: "${command}"

Décompose en 2-4 micro-tâches JSON:
{
  "mission": "résumé court",
  "tasks": [
    {"id": 1, "description": "...", "role": "worker"}
  ]
}
Réponds UNIQUEMENT en JSON valide.`;

    const planResult = await callLLM(planPrompt, {
      role: "strategist",
      temperature: 0.2,
      mission_id: mission.id,
      step_id: "plan",
    });
    const plan = safeParseJSON(planResult.text, {
      mission: command,
      tasks: [{ id: 1, description: command, role: "worker" }],
    });

    mission = addModelUsed(mission, planResult.model);
    mission = addMissionStep(mission, { id: 'plan', skill: 'strategist', description: 'Planification', status: 'done', result: plan.mission });

    await replyFn(
      `📋 **${plan.mission || "Plan d'exécution"}**\n${plan.tasks.map((t) => ` • ${t.description}`).join("\n")}`,
      { parse_mode: "Markdown" }
    );
    broadcastHUD({ type: "plan_ready", tasks: plan.tasks.length, missionId: mission.id });
    if (missionId) appendMissionEvent(missionId, { type: "plan_ready", tasks: plan.tasks });

    // 2. Exécution parallèle
    const results = await Promise.all(
      plan.tasks.map(async (task) => {
        broadcastHUD({ type: "task_start", task: task.description.substring(0, 60), missionId: mission.id });
        if (missionId) appendMissionEvent(missionId, { type: "task_start", task: task.description });

        const role = task.role || "worker";
        const res = await callLLM(task.description, {
          role,
          temperature: 0.3,
          mission_id: mission.id,
          step_id: `task_${task.id}`,
        });
        logger.info(`⚡ [${res.model}] Tâche ${task.id} terminée`, { mission_id: mission.id });
        broadcastHUD({ type: "task_done", task: task.description.substring(0, 60), missionId: mission.id });
        if (missionId) appendMissionEvent(missionId, { type: "task_done", model: res.model });

        return { ...task, result: res.text, model: res.model };
      })
    );

    results.forEach((r) => { mission = addModelUsed(mission, r.model); });

    // 3. Synthèse
    broadcastHUD({ type: "thinking", agent: "Synthèse", thought: "Finalisation...", missionId: mission.id });
    const synthPrompt = `Synthétise ces résultats en une réponse claire:
${results.map((r, i) => `[${i + 1}] ${r.result.substring(0, 300)}`).join("\n\n")}

Objectif: ${plan.mission}
Réponse directe, sans répéter les étapes.`;

    const synthesis = await callLLM(synthPrompt, {
      role: "synthesizer",
      temperature: 0.3,
      mission_id: mission.id,
      step_id: "synthesis",
    });
    mission = addModelUsed(mission, synthesis.model);

    // Finalisation
    mission = finalizeMission(mission, { status: 'success', result: synthesis.text });
    logger.info(missionSummary(mission));

    saveMission({
      id: mission.id,
      command,
      status: "success",
      duration: mission.duration_ms,
      models: mission.models_used,
      result: synthesis.text,
      ts: mission.completed_at,
    });
    broadcastHUD({ type: "mission_complete", duration: mission.duration_ms, missionId: mission.id });

    if (missionId) {
      updateMission(missionId, {
        status: "success",
        result: synthesis.text,
        duration: mission.duration_ms,
        models: mission.models_used,
        completedAt: mission.completed_at,
      });
    }

    return `${synthesis.text}\n\n_⏱ ${(mission.duration_ms / 1000).toFixed(1)}s — Modèles: ${mission.models_used.join(", ")}_`;
  } catch (err) {
    mission = finalizeMission(mission, { status: 'error', error: err.message });
    logger.error(`Butterfly Loop: ${err.message}`, { mission_id: mission.id });
    saveMission({ id: mission.id, command, status: "error", error: err.message, ts: mission.completed_at });
    broadcastHUD({ type: "mission_error", error: err.message, missionId: mission.id });
    if (missionId) updateMission(missionId, { status: "error", error: err.message, completedAt: mission.completed_at });
    throw err;
  }
}

export async function runMission(command, missionId) {
  return butterflyLoop(command, async () => {}, missionId);
}

// ─── Démarrage ───────────────────────────────────────────────────────────────────────────────
logger.info("╔══════════════════════════════════════════╗");
logger.info(`║ 🐝 LaRuche OSS v4.1 — ${STANDALONE ? "Standalone    " : "Telegram mode"} ║`);
logger.info("╚══════════════════════════════════════════╝");

// Démarrage du serveur HUD WebSocket (après validation config, avec gestion EADDRINUSE)
wss = startHUDServer();
logger.info(`📡 HUD WebSocket en écoute sur port ${CONFIG.HUD_PORT}`);

await printRoles();

autoDetectRoles()
  .then((roles) => logger.info(`✅ Rôles préchaufés: ${Object.values(roles).join(", ")}`))
  .catch(() => {});

try {
  startCronRunner();
  logger.info("⏰ Cron runner démarré");
} catch (err) {
  logger.warn(`Cron runner: ${err.message}`);
}

// ─── MODE STANDALONE ───────────────────────────────────────────────────────────────────────
if (STANDALONE) {
  logger.info("🌐 Mode Standalone activé — Telegram désactivé");
  startStandaloneServer({ loadMissions, saveMission, runMission, autoDetectRoles, broadcastHUD, logger });
  const shutdown = () => { logger.info("🛑 Arrêt en cours..."); wss.close(); process.exit(0); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

// ─── MODE TELEGRAM ───────────────────────────────────────────────────────────────────────────
else {
  const bot = new Telegraf(CONFIG.TELEGRAM_TOKEN);

  bot.use(async (ctx, next) => {
    if (String(ctx.from?.id) !== CONFIG.ADMIN_ID) { await ctx.reply("⛔ Accès refusé."); return; }
    return next();
  });

  bot.command("start", async (ctx) => {
    const roles = await autoDetectRoles();
    await ctx.reply(
      `🐝 *LaRuche OSS v4.1 — 100% Local*\n\n` +
      `*Modèles actifs:*\n` +
      ` 👑 Stratège: \`${roles.strategist}\`\n` +
      ` 🔧 Code: \`${roles.architect}\`\n` +
      ` ⚡ Worker: \`${roles.worker}\`\n` +
      ` 👁 Vision: \`${roles.vision}\`\n\n` +
      `*Commandes:*\n` +
      `/status — État\n/models — Modèles actifs\n/mission <tâche> — Mission\n/skill <desc> — Créer skill\n\n` +
      `_Message libre → Mission directe_`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("models", async (ctx) => {
    const roles = await autoDetectRoles();
    const lines = Object.entries(roles).map(([role, model]) => ` \`${role}\`: ${model}`);
    await ctx.reply(`*Configuration Modèles (Ollama local):*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
  });

  bot.command("status", async (ctx) => {
    const roles = await autoDetectRoles();
    const missions = loadMissions();
    const success = missions.filter((m) => m.status === "success").length;
    await ctx.reply(
      `*ÉTAT LARUCHE OSS v4.1*\n\n` +
      `Stratège: \`${roles.strategist}\`\nMissions: ${missions.length} (${success} réussies)\n` +
      `HUD: ✅ ${hudClients.size} client(s)\nUptime: ${Math.floor(process.uptime() / 60)}min\n` +
      `Mode: 🔓 100% Open Source Local`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("mission", async (ctx) => {
    const text = ctx.message.text.replace("/mission", "").trim();
    if (!text) { await ctx.reply("Usage: /mission <tâche>"); return; }
    try {
      const result = await butterflyLoop(text, (msg, opts) => ctx.reply(msg, opts));
      for (const chunk of splitMsg(result)) await ctx.reply(chunk, { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  });

  bot.command("skill", async (ctx) => {
    const desc = ctx.message.text.replace("/skill", "").trim();
    if (!desc) { await ctx.reply("Usage: /skill <description>"); return; }
    const roles = await autoDetectRoles();
    const msg = await ctx.reply(`🔧 Génération skill avec \`${roles.architect}\`...`, { parse_mode: "Markdown" });
    const codePrompt = `Génère un skill JavaScript pour LaRuche:
Description: ${desc}
Format EXACT:
\`\`\`js
export async function run(params) {
  return { success: true, result: "..." };
}
\`\`\``;
    const result = await callLLM(codePrompt, { role: "architect", temperature: 0.1 });
    const skillName = desc.toLowerCase().replace(/[^a-z0-9]+/g, "_").substring(0, 25);
    const skillDir = join(ROOT, "skills", skillName);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "skill.js"), result.text);
    writeFileSync(join(skillDir, "manifest.json"), JSON.stringify(
      { name: skillName, description: desc, version: "1.0.0", model: result.model, created: new Date().toISOString() }, null, 2
    ));
    await ctx.telegram.editMessageText(
      ctx.chat.id, msg.message_id, undefined,
      `✅ Skill créé: \`${skillName}\`\n\n${result.text.substring(0, 500)}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.on("text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const text = ctx.message.text.trim();
    try {
      const { isComputerUseIntent, runIntentPipeline } = await import("./agents/intentPipeline.js");
      if (isComputerUseIntent(text)) {
        const statusMsg = await ctx.reply(`🧠 Planification: _"${text.slice(0, 60)}"_`, { parse_mode: "Markdown" });
        const pipelineResult = await runIntentPipeline(text, {
          hudFn: broadcastHUD,
          onPlanReady: async (planResult) => {
            const stepList = planResult.steps.map((s, i) => ` ${i + 1}. \`${s.skill}\``).join("\n");
            await ctx.telegram.editMessageText(
              ctx.chat.id, statusMsg.message_id, undefined,
              `📋 *${planResult.goal}*\n\n${stepList}`, { parse_mode: "Markdown" }
            ).catch(() => {});
          },
          onStepDone: (current, total, step, result) => {
            const icon = result?.success !== false ? "✅" : "❌";
            logger.info(`[intent] Step ${current}/${total}: ${icon} ${step.skill}`);
          },
        });
        const duration = (pipelineResult.duration / 1000).toFixed(1);
        const icon = pipelineResult.success ? "✅" : "⚠️";
        await ctx.reply(
          pipelineResult.success
            ? `${icon} *${pipelineResult.goal}*\n_${pipelineResult.steps.length} étapes — ${duration}s_`
            : `${icon} *Partiel:* ${pipelineResult.goal}\n_${pipelineResult.error || "Certaines étapes ont échoué"}_`,
          { parse_mode: "Markdown" }
        );
        saveMission({ command: text, status: pipelineResult.success ? "success" : "partial", duration: pipelineResult.duration, ts: new Date().toISOString() });
        import("./memory_store.js")
          .then(({ storeMissionMemory }) => { storeMissionMemory(pipelineResult).catch(() => {}); })
          .catch(() => {});
      } else {
        const result = await butterflyLoop(text, (msg, opts) => ctx.reply(msg, opts));
        for (const chunk of splitMsg(result)) await ctx.reply(chunk, { parse_mode: "Markdown" });
      }
    } catch (err) {
      logger.error(`Text handler: ${err.message}`);
      await ctx.reply(`❌ ${err.message}`);
    }
  });

  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/getUpdates?timeout=0&offset=-1`);
    await new Promise((r) => setTimeout(r, 1500));
    logger.info("🔑 Session Telegram libérée");
  } catch {
    logger.warn("Libération session Telegram impossible");
  }

  bot.launch({ dropPendingUpdates: true })
    .then(() => logger.info("🤖 Bot Telegram actif ✅"))
    .catch((err) => {
      if (err.response?.error_code === 409) {
        logger.error("409 Conflict — un autre bot utilise ce token.");
      } else {
        logger.error(`Erreur bot: ${err.message}`);
      }
      process.exit(1);
    });

  const shutdown = () => { logger.info("🛑 Arrêt en cours..."); bot.stop(); wss.close(); process.exit(0); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
