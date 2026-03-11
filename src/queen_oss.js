/**
 * queen_oss.js — LaRuche Queen Open Source Edition
 * 100% Ollama local — GLM, Kimi, Qwen3-Coder, LLaVA
 * Zéro API cloud, zéro coût, vie privée totale
 */

import { Telegraf } from "telegraf";
import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import winston from "winston";
import { ask, stream, route, autoDetectRoles, printRoles } from "./model_router.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Logger ───────────────────────────────────────────────────────────────────
mkdirSync(join(ROOT, ".laruche/logs"), { recursive: true });
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] [${level.toUpperCase()}] ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: join(ROOT, ".laruche/logs/queen.log"),
    }),
  ],
});

// ─── Config ───────────────────────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

if (!TELEGRAM_TOKEN) { logger.error("TELEGRAM_BOT_TOKEN manquant"); process.exit(1); }
if (!ADMIN_ID) { logger.error("ADMIN_TELEGRAM_ID manquant"); process.exit(1); }

// ─── Mission log simple (JSON) ────────────────────────────────────────────────
const MISSIONS_FILE = join(ROOT, ".laruche/missions.json");
function loadMissions() {
  try { return JSON.parse(readFileSync(MISSIONS_FILE, "utf-8")); } catch { return []; }
}
function saveMission(entry) {
  const missions = loadMissions();
  missions.unshift(entry);
  writeFileSync(MISSIONS_FILE, JSON.stringify(missions.slice(0, 200), null, 2));
}

// ─── HUD WebSocket ────────────────────────────────────────────────────────────
let hudClients = new Set();
const wss = new WebSocketServer({ port: 9001 });
wss.on("connection", (ws) => {
  hudClients.add(ws);
  ws.on("close", () => hudClients.delete(ws));
  logger.info(`HUD client connecté (${hudClients.size})`);
});

function hud(event) {
  const msg = JSON.stringify({ ...event, ts: Date.now() });
  hudClients.forEach((ws) => { if (ws.readyState === 1) ws.send(msg); });
}

// ─── Butterfly Loop OSS ───────────────────────────────────────────────────────
async function butterflyLoop(command, ctx) {
  const start = Date.now();
  logger.info(`🦋 Mission: ${command.substring(0, 80)}`);
  hud({ type: "mission_start", command: command.substring(0, 100) });

  const roles = await autoDetectRoles();

  try {
    // 1. Décomposition par le Stratège (GLM-4.6 ou meilleur disponible)
    await ctx.reply(`🧠 Analyse avec **${roles.strategist}**...`, { parse_mode: "Markdown" });
    hud({ type: "thinking", agent: "L1_Stratège", thought: "Décomposition de la mission..." });

    const planPrompt = `Tu es le stratège de LaRuche, un essaim d'agents IA.
Mission: "${command}"

Décompose en 2-4 micro-tâches JSON:
{
  "mission": "résumé court",
  "tasks": [
    {"id": 1, "description": "...", "role": "architect|worker|vision"}
  ]
}

Réponds UNIQUEMENT en JSON valide.`;

    const planResult = await ask(planPrompt, { role: "strategist", temperature: 0.2 });
    hud({ type: "thinking", agent: "L1_Stratège", thought: planResult.text.substring(0, 100) });

    let plan;
    try {
      const match = planResult.text.match(/\{[\s\S]*\}/);
      plan = match ? JSON.parse(match[0]) : {
        mission: command,
        tasks: [{ id: 1, description: command, role: "worker" }],
      };
    } catch {
      plan = { mission: command, tasks: [{ id: 1, description: command, role: "worker" }] };
    }

    await ctx.reply(`📋 **${plan.mission}**\n${plan.tasks.map((t) => `  • ${t.description}`).join("\n")}`, {
      parse_mode: "Markdown",
    });
    hud({ type: "plan_ready", tasks: plan.tasks.length });

    // 2. Exécution parallèle par les Ouvrières
    const results = await Promise.all(
      plan.tasks.map(async (task) => {
        hud({ type: "task_start", task: task.description.substring(0, 60) });

        const model = task.role === "architect" ? roles.architect
          : task.role === "vision" ? roles.vision
          : roles.worker;

        const result = await ask(
          `Tâche: ${task.description}\nContexte: ${plan.mission}\n\nRéponds directement et avec précision.`,
          { role: task.role || "worker", temperature: task.role === "architect" ? 0.1 : 0.4 }
        );

        logger.info(`⚡ [${model}] Tâche ${task.id} terminée`);
        hud({ type: "task_done", task: task.description.substring(0, 60) });
        return { task: task.description, result: result.text, model: result.model };
      })
    );

    // 3. Synthèse Chain-of-Thought
    hud({ type: "thinking", agent: "L2_Synthèse", thought: "Synthèse des résultats..." });
    const synthPrompt = `Synthétise ces résultats en une réponse claire pour l'utilisateur:
${results.map((r, i) => `[${i + 1}] ${r.result.substring(0, 300)}`).join("\n\n")}

Objectif: ${plan.mission}
Réponse directe, sans répéter les étapes.`;

    const synthesis = await ask(synthPrompt, { role: "synthesizer", temperature: 0.3 });

    const duration = Date.now() - start;
    saveMission({ command, status: "success", duration, models: [...new Set(results.map((r) => r.model))], ts: new Date().toISOString() });
    hud({ type: "mission_complete", duration, cost: 0 });

    // Modèles utilisés
    const modelsUsed = [...new Set(results.map((r) => r.model))].join(", ");
    return `${synthesis.text}\n\n_Modèles: ${modelsUsed} — ${(duration / 1000).toFixed(1)}s_`;

  } catch (e) {
    logger.error(`Butterfly Loop error: ${e.message}`);
    saveMission({ command, status: "error", error: e.message, ts: new Date().toISOString() });
    hud({ type: "mission_error", error: e.message });
    throw e;
  }
}

// ─── Bot Telegram ─────────────────────────────────────────────────────────────
const bot = new Telegraf(TELEGRAM_TOKEN);

// Auth middleware
bot.use(async (ctx, next) => {
  if (String(ctx.from?.id) !== ADMIN_ID) {
    await ctx.reply("⛔ Accès refusé.");
    return;
  }
  return next();
});

bot.command("start", async (ctx) => {
  const roles = await autoDetectRoles();
  await ctx.reply(
    `🐝 *LaRuche OSS v3.1 — 100% Local*\n\n` +
    `*Modèles actifs:*\n` +
    `  👑 Stratège: \`${roles.strategist}\`\n` +
    `  🔧 Code: \`${roles.architect}\`\n` +
    `  ⚡ Worker: \`${roles.worker}\`\n` +
    `  👁 Vision: \`${roles.vision}\`\n\n` +
    `*Commandes:*\n` +
    `/status — État\n` +
    `/models — Modèles actifs\n` +
    `/mission <texte> — Mission\n` +
    `/skill <desc> — Créer skill\n\n` +
    `_Message libre → Mission directe_`,
    { parse_mode: "Markdown" }
  );
});

bot.command("models", async (ctx) => {
  const roles = await autoDetectRoles();
  const lines = Object.entries(roles).map(([role, model]) => `  \`${role}\`: ${model}`);
  await ctx.reply(`*Configuration Modèles (Ollama local):*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
});

bot.command("status", async (ctx) => {
  const roles = await autoDetectRoles();
  const missions = loadMissions();
  const success = missions.filter((m) => m.status === "success").length;
  await ctx.reply(
    `*ÉTAT LARUCHE OSS*\n\n` +
    `Stratège: \`${roles.strategist}\`\n` +
    `Missions: ${missions.length} (${success} réussies)\n` +
    `HUD: ✅ ${hudClients.size} client(s)\n` +
    `Uptime: ${Math.floor(process.uptime() / 60)}min\n` +
    `Mode: 🔓 100% Open Source Local`,
    { parse_mode: "Markdown" }
  );
});

bot.command("mission", async (ctx) => {
  const text = ctx.message.text.replace("/mission", "").trim();
  if (!text) { await ctx.reply("Usage: /mission <votre commande>"); return; }
  try {
    const result = await butterflyLoop(text, ctx);
    for (const chunk of (result.match(/.{1,3900}/g) || [result])) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  } catch (e) { await ctx.reply(`❌ ${e.message}`); }
});

bot.command("skill", async (ctx) => {
  const desc = ctx.message.text.replace("/skill", "").trim();
  if (!desc) { await ctx.reply("Usage: /skill <description du skill>"); return; }

  const roles = await autoDetectRoles();
  const msg = await ctx.reply(`🔧 Génération skill avec \`${roles.architect}\`...`, { parse_mode: "Markdown" });

  const codePrompt = `Génère un skill JavaScript pour LaRuche:
Description: ${desc}

Format EXACT:
\`\`\`js
// Skill: ${desc}
export async function run(params) {
  // Implementation
  return { success: true, result: "..." };
}
\`\`\`

Code fonctionnel uniquement, pas d'explication.`;

  const result = await ask(codePrompt, { role: "architect", temperature: 0.1 });

  const skillName = desc.toLowerCase().replace(/[^a-z0-9]+/g, "_").substring(0, 25);
  const skillDir = join(ROOT, "skills", skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.js"), result.text);
  writeFileSync(join(skillDir, "manifest.json"), JSON.stringify({
    name: skillName, description: desc, version: "1.0.0",
    model: result.model, created: new Date().toISOString(),
  }, null, 2));

  await ctx.telegram.editMessageText(
    ctx.chat.id, msg.message_id, undefined,
    `✅ Skill créé: \`${skillName}\`\n\n${result.text.substring(0, 500)}`,
    { parse_mode: "Markdown" }
  );
});

// Messages libres → mission directe
bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  try {
    const result = await butterflyLoop(ctx.message.text, ctx);
    for (const chunk of (result.match(/.{1,3900}/g) || [result])) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  } catch (e) { await ctx.reply(`❌ ${e.message}`); }
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
logger.info("╔══════════════════════════════════════════╗");
logger.info("║  🐝 LaRuche OSS v3.1 — 100% Local       ║");
logger.info("╚══════════════════════════════════════════╝");

await printRoles();

bot.launch({ dropPendingUpdates: true });
logger.info("🤖 Bot Telegram OSS actif");
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
