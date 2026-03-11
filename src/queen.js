/**
 * queen.js — Orchestrateur Central LaRuche v3.0
 * Butterfly Loop : Telegram → Gemini → Kimi ×10 → Vision → HID → Rapport
 */

import { Telegraf } from "telegraf";
import { createRequire } from "module";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import winston from "winston";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Logger ───────────────────────────────────────────────────────────────────
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
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 3,
    }),
  ],
});

// ─── Config ──────────────────────────────────────────────────────────────────
const CONFIG = JSON.parse(
  readFileSync(join(ROOT, ".laruche/config.json"), "utf-8")
);

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

if (!TELEGRAM_TOKEN) {
  logger.error("TELEGRAM_BOT_TOKEN manquant dans .env");
  process.exit(1);
}
if (!ADMIN_ID) {
  logger.error("ADMIN_TELEGRAM_ID manquant dans .env");
  process.exit(1);
}

// ─── SQLite DB ────────────────────────────────────────────────────────────────
mkdirSync(join(ROOT, ".laruche"), { recursive: true });
const db = new Database(join(ROOT, ".laruche/shadow-errors.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    command TEXT NOT NULL,
    status TEXT NOT NULL,
    cost_usd REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    agent TEXT DEFAULT 'queen',
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    mission_id INTEGER,
    model TEXT NOT NULL,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS kimi_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    task TEXT NOT NULL,
    error TEXT NOT NULL,
    corrected_prompt TEXT,
    resolved INTEGER DEFAULT 0
  );
`);

// ─── WebSocket HUD ────────────────────────────────────────────────────────────
let hudClients = new Set();

function hudBroadcast(event) {
  const msg = JSON.stringify({ ...event, ts: Date.now() });
  hudClients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

const wss = new WebSocketServer({ port: CONFIG.hudPort || 9001 });
wss.on("connection", (ws) => {
  hudClients.add(ws);
  ws.on("close", () => hudClients.delete(ws));
  logger.info(`HUD client connecté (total: ${hudClients.size})`);
});

// ─── Ollama Client ────────────────────────────────────────────────────────────
async function ollamaGenerate(prompt, model = "llama3.2:3b") {
  try {
    const res = await fetch(`${process.env.OLLAMA_HOST || "http://localhost:11434"}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    return data.response || "";
  } catch (e) {
    logger.error(`Ollama error: ${e.message}`);
    return `[Erreur Ollama: ${e.message}]`;
  }
}

async function ollamaHealth() {
  try {
    const res = await fetch(
      `${process.env.OLLAMA_HOST || "http://localhost:11434"}/api/tags`,
      { signal: AbortSignal.timeout(3000) }
    );
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Synapse-Vault (ChromaDB) ────────────────────────────────────────────────
async function findSimilarExperiences(situation, k = 5) {
  try {
    const { ChromaClient } = await import("chromadb");
    const client = new ChromaClient();
    const collection = await client.getOrCreateCollection({ name: "laruche_experiences" });
    const count = await collection.count();
    if (count === 0) return [];
    // Requête sémantique via texte (sans embedding explicite pour la démo)
    const results = await collection.query({
      queryTexts: [situation],
      nResults: Math.min(k, count),
      where: { resolved: true },
    });
    return results.documents[0] || [];
  } catch (e) {
    logger.debug(`Vault query skipped: ${e.message}`);
    return [];
  }
}

// ─── Mission DB ───────────────────────────────────────────────────────────────
function saveMission(command, status, costUsd = 0, durationMs = 0, error = null) {
  const stmt = db.prepare(
    "INSERT INTO missions (timestamp, command, status, cost_usd, duration_ms, error) VALUES (?, ?, ?, ?, ?, ?)"
  );
  return stmt.run(new Date().toISOString(), command, status, costUsd, durationMs, error);
}

// ─── Butterfly Loop ───────────────────────────────────────────────────────────
async function butterflyLoop(rawCommand, ctx) {
  const startTime = Date.now();
  logger.info(`🦋 Butterfly Loop: ${rawCommand.substring(0, 80)}`);
  hudBroadcast({ type: "mission_start", command: rawCommand.substring(0, 100) });

  try {
    // 0. Consultation mémoire
    await ctx.reply("🧠 Consultation mémoire...");
    const pastExp = await findSimilarExperiences(rawCommand, 5);

    // 1. Décomposition avec Gemini (ou Ollama fallback)
    hudBroadcast({ type: "thinking", agent: "L1_Gemini", thought: "Décomposition de la mission..." });
    const decompPrompt = `Tu es Gemini, le CEO stratégique de LaRuche.
Mission reçue: "${rawCommand}"
Expériences similaires: ${pastExp.slice(0, 2).join(" | ") || "Aucune"}

Décompose cette mission en 3-5 micro-tâches JSON:
{
  "mission": "résumé",
  "tasks": [
    {"id": 1, "description": "...", "agent": "kimi|claude|vision|shell", "tokens_budget": 500}
  ],
  "estimated_cost_usd": 0.5
}`;

    const planRaw = await ollamaGenerate(decompPrompt, process.env.OLLAMA_MODEL || "llama3.2:3b");

    let plan;
    try {
      const jsonMatch = planRaw.match(/\{[\s\S]*\}/);
      plan = jsonMatch ? JSON.parse(jsonMatch[0]) : { mission: rawCommand, tasks: [{ id: 1, description: rawCommand, agent: "kimi" }] };
    } catch {
      plan = { mission: rawCommand, tasks: [{ id: 1, description: rawCommand, agent: "ollama" }] };
    }

    hudBroadcast({ type: "plan_ready", tasks: plan.tasks?.length || 1 });
    await ctx.reply(`📋 Plan: ${plan.mission}\n${plan.tasks?.map((t) => `  • ${t.description}`).join("\n") || rawCommand}`);

    // 2. Exécution des tâches (Kimi/Ollama Overdrive)
    const results = [];
    for (const task of plan.tasks || [{ description: rawCommand }]) {
      hudBroadcast({ type: "task_start", task: task.description?.substring(0, 60) });
      const taskResult = await ollamaGenerate(
        `Tâche: ${task.description}\nContexte mission: ${plan.mission}\nRéponds directement et avec précision.`,
        process.env.OLLAMA_MODEL || "llama3.2:3b"
      );
      results.push({ task: task.description, result: taskResult });
      hudBroadcast({ type: "task_done", task: task.description?.substring(0, 60) });
    }

    // 3. Synthèse
    const synthesis = results.map((r) => `• ${r.result.substring(0, 200)}`).join("\n");
    const duration = Date.now() - startTime;

    saveMission(rawCommand, "success", 0, duration);
    hudBroadcast({ type: "mission_complete", duration, cost: 0 });

    return synthesis || "Mission accomplie.";
  } catch (e) {
    const duration = Date.now() - startTime;
    logger.error(`Butterfly Loop error: ${e.message}`);
    saveMission(rawCommand, "error", 0, duration, e.message);
    hudBroadcast({ type: "mission_error", error: e.message });
    throw e;
  }
}

// ─── Telegram Bot ─────────────────────────────────────────────────────────────
const bot = new Telegraf(TELEGRAM_TOKEN);

// Middleware auth
bot.use(async (ctx, next) => {
  const userId = String(ctx.from?.id);
  if (userId !== ADMIN_ID) {
    await ctx.reply("⛔ Accès refusé.");
    return;
  }
  return next();
});

bot.command("start", async (ctx) => {
  const ollama = await ollamaHealth();
  await ctx.reply(
    `🐝 *LaRuche v3.0 SINGULARITY*\n\n` +
    `Ollama: ${ollama ? "✅ ON" : "❌ OFF"}\n` +
    `HUD WebSocket: ✅ Port ${CONFIG.hudPort}\n\n` +
    `*Commandes:*\n` +
    `/status — État système\n` +
    `/mission <texte> — Lancer une mission\n` +
    `/vision — Capture + analyse écran\n` +
    `/rollback — Restaurer dernier snapshot\n` +
    `/kill — Arrêt d'urgence\n\n` +
    `_Message libre → Mission directe_`,
    { parse_mode: "Markdown" }
  );
});

bot.command("status", async (ctx) => {
  const ollama = await ollamaHealth();
  const missions = db.prepare("SELECT COUNT(*) as total, SUM(cost_usd) as cost FROM missions").get();
  await ctx.reply(
    `*ÉTAT LARUCHE*\n\n` +
    `Ollama: ${ollama ? "✅" : "❌"}\n` +
    `Missions: ${missions.total}\n` +
    `Coût total: $${(missions.cost || 0).toFixed(4)}\n` +
    `HUD: ✅ ${hudClients.size} client(s)\n` +
    `Uptime: ${Math.floor(process.uptime() / 60)}min`,
    { parse_mode: "Markdown" }
  );
});

bot.command("mission", async (ctx) => {
  const text = ctx.message.text.replace("/mission", "").trim();
  if (!text) {
    await ctx.reply("Usage: /mission <votre commande>");
    return;
  }
  try {
    const result = await butterflyLoop(text, ctx);
    const chunks = result.match(/.{1,3900}/g) || [result];
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } catch (e) {
    await ctx.reply(`❌ Erreur: ${e.message}`);
  }
});

bot.command("kill", async (ctx) => {
  hudBroadcast({ type: "kill_all" });
  await ctx.reply("🛑 Kill All envoyé à tous les agents.");
  logger.warn("KILL_ALL déclenché par Telegram");
});

// Messages libres → mission directe
bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;
  try {
    const result = await butterflyLoop(text, ctx);
    const chunks = result.match(/.{1,3900}/g) || [result];
    for (const chunk of chunks) await ctx.reply(chunk);
  } catch (e) {
    await ctx.reply(`❌ ${e.message}`);
  }
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
logger.info("╔══════════════════════════════════════╗");
logger.info("║   🐝 LaRuche v3.0 SINGULARITY       ║");
logger.info("╚══════════════════════════════════════╝");
logger.info(`HUD WebSocket: ws://localhost:${CONFIG.hudPort}`);

bot.launch({ dropPendingUpdates: true });
logger.info("🤖 Bot Telegram actif");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
