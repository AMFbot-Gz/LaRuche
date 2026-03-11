/**
 * queen_oss.js — LaRuche Queen Open Source Edition
 * Version Optimisée & Refactorisée v3.2
 * 100% Ollama local — Zéro API cloud, zéro coût, vie privée totale
 */

import { Telegraf } from "telegraf";
import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import winston from "winston";
import { ask, autoDetectRoles, printRoles } from "./model_router.js";
import { startCronRunner } from "./cron_runner.js";

dotenv.config();

// ─── Chemins et Constantes ───────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LOG_DIR = join(ROOT, ".laruche/logs");
const MISSIONS_FILE = join(ROOT, ".laruche/missions.json");

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ─── Logger (Winston) ─────────────────────────────────────────────────────────
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
    new winston.transports.File({ filename: join(LOG_DIR, "queen.log") }),
  ],
});

// ─── Validation de la Config ──────────────────────────────────────────────────
const CONFIG = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  ADMIN_ID: process.env.ADMIN_TELEGRAM_ID,
  HUD_PORT: parseInt(process.env.HUD_PORT || "9001", 10),
};

if (!CONFIG.TELEGRAM_TOKEN) {
  logger.error("TELEGRAM_BOT_TOKEN manquant");
  process.exit(1);
}
if (!CONFIG.ADMIN_ID) {
  logger.error("ADMIN_TELEGRAM_ID manquant");
  process.exit(1);
}

// ─── Missions (Cache + Persistance) ───────────────────────────────────────────
let _missionsCache = null;

function loadMissions() {
  if (_missionsCache) return _missionsCache;
  try {
    _missionsCache = existsSync(MISSIONS_FILE)
      ? JSON.parse(readFileSync(MISSIONS_FILE, "utf-8"))
      : [];
  } catch (err) {
    logger.error(`Erreur chargement missions: ${err.message}`);
    _missionsCache = [];
  }
  return _missionsCache;
}

function saveMission(entry) {
  _missionsCache = [entry, ...loadMissions()].slice(0, 200);
  try {
    writeFileSync(MISSIONS_FILE, JSON.stringify(_missionsCache, null, 2));
  } catch (err) {
    logger.error(`Erreur sauvegarde mission: ${err.message}`);
  }
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────
const splitMsg = (text, max = 3900) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += max) {
    chunks.push(text.slice(i, i + max));
  }
  return chunks.length ? chunks : [text];
};

const safeParseJSON = (text, fallback) => {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : fallback;
  } catch {
    return fallback;
  }
};

// ─── HUD Service (WebSocket) ───────────────────────────────────────────────────
const hudClients = new Set();
const wss = new WebSocketServer({ port: CONFIG.HUD_PORT });

wss.on("connection", (ws) => {
  hudClients.add(ws);
  logger.info(`HUD: Client connecté (${hudClients.size})`);
  ws.on("close", () => hudClients.delete(ws));
});

function broadcastHUD(event) {
  const msg = JSON.stringify({ ...event, ts: Date.now() });
  hudClients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// ─── Butterfly Loop (Cœur IA) ──────────────────────────────────────────────────────
async function butterflyLoop(command, ctx) {
  const start = Date.now();
  logger.info(`🦋 Mission: ${command.substring(0, 80)}`);
  broadcastHUD({ type: "mission_start", command: command.substring(0, 100) });

  const roles = await autoDetectRoles();

  try {
    // 1. Stratégie
    await ctx.reply(`🧠 Analyse stratégique avec **${roles.strategist}**...`, {
      parse_mode: "Markdown",
    });
    broadcastHUD({ type: "thinking", agent: "Stratège", thought: "Planification..." });

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

    const planResult = await ask(planPrompt, { role: "strategist", temperature: 0.2 });
    const plan = safeParseJSON(planResult.text, {
      mission: command,
      tasks: [{ id: 1, description: command, role: "worker" }],
    });

    await ctx.reply(
      `📋 **${plan.mission || "Plan d'exécution"}**\n${plan.tasks
        .map((t) => ` • ${t.description}`)
        .join("\n")}`,
      { parse_mode: "Markdown" }
    );
    broadcastHUD({ type: "plan_ready", tasks: plan.tasks.length });

    // 2. Exécution parallèle
    const results = await Promise.all(
      plan.tasks.map(async (task) => {
        broadcastHUD({ type: "task_start", task: task.description.substring(0, 60) });
        const role = task.role || "worker";
        const res = await ask(task.description, { role, temperature: 0.3 });
        logger.info(`⚡ [${res.model}] Tâche ${task.id} terminée`);
        broadcastHUD({ type: "task_done", task: task.description.substring(0, 60) });
        return { ...task, result: res.text, model: res.model };
      })
    );

    // 3. Synthèse
    broadcastHUD({ type: "thinking", agent: "Synthèse", thought: "Finalisation..." });
    const synthPrompt = `Synthétise ces résultats en une réponse claire:
${results.map((r, i) => `[${i + 1}] ${r.result.substring(0, 300)}`).join("\n\n")}

Objectif: ${plan.mission}
Réponse directe, sans répéter les étapes.`;

    const synthesis = await ask(synthPrompt, { role: "synthesizer", temperature: 0.3 });

    const duration = Date.now() - start;
    const modelsUsed = [...new Set(results.map((r) => r.model))].join(", ");

    saveMission({
      command,
      status: "success",
      duration,
      models: [...new Set(results.map((r) => r.model))],
      ts: new Date().toISOString(),
    });
    broadcastHUD({ type: "mission_complete", duration, cost: 0 });

    return `${synthesis.text}\n\n_⏱ ${(duration / 1000).toFixed(1)}s — Modèles: ${modelsUsed}_`;
  } catch (err) {
    logger.error(`Butterfly Loop: ${err.message}`);
    saveMission({ command, status: "error", error: err.message, ts: new Date().toISOString() });
    broadcastHUD({ type: "mission_error", error: err.message });
    throw err;
  }
}

// ─── Bot Telegram Service ───────────────────────────────────────────────────────
const bot = new Telegraf(CONFIG.TELEGRAM_TOKEN);

// Auth Middleware
bot.use(async (ctx, next) => {
  if (String(ctx.from?.id) !== CONFIG.ADMIN_ID) {
    await ctx.reply("⛔ Accès refusé.");
    return;
  }
  return next();
});

// Commande /start
bot.command("start", async (ctx) => {
  const roles = await autoDetectRoles();
  await ctx.reply(
    `🐝 *LaRuche OSS v3.2 — 100% Local*\n\n` +
      `*Modèles actifs:*\n` +
      ` 👑 Stratège: \`${roles.strategist}\`\n` +
      ` 🔧 Code: \`${roles.architect}\`\n` +
      ` ⚡ Worker: \`${roles.worker}\`\n` +
      ` 👁 Vision: \`${roles.vision}\`\n\n` +
      `*Commandes:*\n` +
      `/status — État\n` +
      `/models — Modèles actifs\n` +
      `/mission <tâche> — Mission\n` +
      `/skill <desc> — Créer skill\n\n` +
      `_Message libre → Mission directe_`,
    { parse_mode: "Markdown" }
  );
});

// Commande /models
bot.command("models", async (ctx) => {
  const roles = await autoDetectRoles();
  const lines = Object.entries(roles).map(
    ([role, model]) => ` \`${role}\`: ${model}`
  );
  await ctx.reply(
    `*Configuration Modèles (Ollama local):*\n\n${lines.join("\n")}`,
    { parse_mode: "Markdown" }
  );
});

// Commande /status
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

// Commande /mission
bot.command("mission", async (ctx) => {
  const text = ctx.message.text.replace("/mission", "").trim();
  if (!text) {
    await ctx.reply("Usage: /mission <tâche>");
    return;
  }
  try {
    const result = await butterflyLoop(text, ctx);
    for (const chunk of splitMsg(result)) {
      await ctx.reply(chunk, { parse_mode: "Markdown" });
    }
  } catch (err) {
    await ctx.reply(`❌ ${err.message}`);
  }
});

// Commande /skill
bot.command("skill", async (ctx) => {
  const desc = ctx.message.text.replace("/skill", "").trim();
  if (!desc) {
    await ctx.reply("Usage: /skill <description>");
    return;
  }
  const roles = await autoDetectRoles();
  const msg = await ctx.reply(`🔧 Génération skill avec \`${roles.architect}\`...`, {
    parse_mode: "Markdown",
  });

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
  writeFileSync(
    join(skillDir, "manifest.json"),
    JSON.stringify(
      {
        name: skillName,
        description: desc,
        version: "1.0.0",
        model: result.model,
        created: new Date().toISOString(),
      },
      null,
      2
    )
  );
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    msg.message_id,
    undefined,
    `✅ Skill créé: \`${skillName}\`\n\n${result.text.substring(0, 500)}`,
    { parse_mode: "Markdown" }
  );
});

// ─── Messages libres ──────────────────────────────────────────────────────────────
bot.on("text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  const text = ctx.message.text.trim();

  try {
    // Détection intention computer-use
    const { isComputerUseIntent, runIntentPipeline } = await import(
      "./agents/intentPipeline.js"
    );

    if (isComputerUseIntent(text)) {
      // Pipeline planner + operator
      const statusMsg = await ctx.reply(
        `🧠 Planification: _"${text.slice(0, 60)}"_`,
        { parse_mode: "Markdown" }
      );
      const pipelineResult = await runIntentPipeline(text, {
        hudFn: broadcastHUD,
        onPlanReady: async (planResult) => {
          const stepList = planResult.steps
            .map((s, i) => ` ${i + 1}. \`${s.skill}\``)
            .join("\n");
          await ctx.telegram
            .editMessageText(
              ctx.chat.id,
              statusMsg.message_id,
              undefined,
              `📋 *${planResult.goal}*\n\n${stepList}`,
              { parse_mode: "Markdown" }
            )
            .catch(() => {});
        },
        onStepDone: (current, total, step, result) => {
          const icon = result?.success !== false ? "✅" : "❌";
          logger.info(`[intent] Step ${current}/${total}: ${icon} ${step.skill}`);
        },
      });

      const duration = (pipelineResult.duration / 1000).toFixed(1);
      const icon = pipelineResult.success ? "✅" : "⚠️";
      const reply = pipelineResult.success
        ? `${icon} *${pipelineResult.goal}*\n_${pipelineResult.steps.length} étapes — ${duration}s_`
        : `${icon} *Partiel:* ${pipelineResult.goal}\n_${pipelineResult.error || "Certaines étapes ont échoué"}_`;

      await ctx.reply(reply, { parse_mode: "Markdown" });
      saveMission({
        command: text,
        status: pipelineResult.success ? "success" : "partial",
        duration: pipelineResult.duration,
        ts: new Date().toISOString(),
      });

      // Mémoire
      import("./memory_store.js")
        .then(({ storeMissionMemory }) => {
          storeMissionMemory(pipelineResult).catch(() => {});
        })
        .catch(() => {});
    } else {
      // Mission texte classique
      const result = await butterflyLoop(text, ctx);
      for (const chunk of splitMsg(result)) {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      }
    }
  } catch (err) {
    logger.error(`Text handler: ${err.message}`);
    await ctx.reply(`❌ ${err.message}`);
  }
});

// ─── Démarrage et Shutdown ────────────────────────────────────────────────────
logger.info("╔══════════════════════════════════════════╗");
logger.info("║ 🐝 LaRuche OSS v3.2 — 100% Local       ║");
logger.info("╚══════════════════════════════════════════╝");

await printRoles();

// Libération de session Telegram préventive
try {
  await fetch(
    `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/getUpdates?timeout=0&offset=-1`
  );
  await new Promise((r) => setTimeout(r, 1500));
  logger.info("🔑 Session Telegram libérée");
} catch {
  logger.warn("Libération session Telegram impossible");
}

// Lancement non-bloquant
bot
  .launch({ dropPendingUpdates: true })
  .then(() => {
    logger.info("🤖 Bot Telegram actif ✅");
  })
  .catch((err) => {
    if (err.response?.error_code === 409) {
      logger.error(
        "409 Conflict — un autre bot utilise ce token. Stopper le service concurrent."
      );
    } else {
      logger.error(`Erreur bot: ${err.message}`);
    }
    process.exit(1);
  });

// Pre-warm: auto-détection des rôles
autoDetectRoles()
  .then((roles) => {
    logger.info(`✅ Rôles préchauffés: ${Object.values(roles).join(", ")}`);
  })
  .catch(() => {});

// Cron runner
try {
  startCronRunner();
  logger.info("⏰ Cron runner démarré");
} catch (err) {
  logger.warn(`Cron runner: ${err.message}`);
}

// Graceful shutdown
const shutdown = () => {
  logger.info("🛱 Arrêt en cours...");
  bot.stop();
  wss.close();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
