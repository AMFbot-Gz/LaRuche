/**
 * cron_runner.js — Exécuteur de jobs planifiés LaRuche
 *
 * Lit workspace/cron/jobs.yml au démarrage et planifie chaque job.
 * Chaque job peut:
 *   - Lancer une intention via intentPipeline (computer-use)
 *   - Appeler directement un MCP
 *   - Exécuter une commande terminal
 */

import cron from "node-cron";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import winston from "winston";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] [CRON] ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: join(ROOT, ".laruche/logs/cron.log") }),
  ],
});

// ─── Lecture jobs YAML (parser minimal) ───────────────────────────────────────

function parseJobsYaml(yamlStr) {
  const jobs = [];
  const lines = yamlStr.split("\n");
  let current = null;
  let actionLines = [];
  let inAction = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) continue;

    if (trimmed.startsWith("- id:") || trimmed.startsWith("- name:")) {
      if (current) {
        current.action = actionLines.join("\n").trim();
        if (current.enabled !== false) jobs.push(current);
      }
      const keyVal = trimmed.replace(/^-\s+\w+:\s*/, "");
      current = { id: keyVal.trim(), action: "" };
      actionLines = [];
      inAction = false;
    } else if (current) {
      const match = trimmed.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const key = match[1];
        const val = match[2].replace(/^["']|["']$/g, "");
        if (key === "enabled") current.enabled = val !== "false";
        else if (key !== "action") current[key] = val;
        inAction = key === "action";
        // Ne pas pousser le "|" du block scalar YAML comme une commande
        if (inAction && val !== "|") actionLines.push(val);
      } else if (inAction && line.startsWith("      ")) {
        actionLines.push(trimmed);
      }
    }
  }

  if (current) {
    current.action = actionLines.join("\n").trim();
    if (current.enabled !== false) jobs.push(current);
  }

  return jobs;
}

// ─── Alerter via Telegram ──────────────────────────────────────────────────────

async function alertTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ADMIN_TELEGRAM_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `⏰ Cron: ${message}`, parse_mode: "Markdown" }),
    });
  } catch {}
}

// ─── Exécution d'un job ────────────────────────────────────────────────────────

async function executeJob(job) {
  logger.info(`Exécution job: ${job.id}`);
  const startTime = Date.now();

  try {
    const actionType = job.action || "";

    // Cas 1 : action: mission → envoyer au runMission de la Queen
    if (actionType === "mission" && job.mission) {
      const { runIntentPipeline } = await import("./agents/intentPipeline.js");
      const { ask } = await import("./model_router.js");
      const res = await ask(job.mission, { role: "worker", temperature: 0.4, timeout: 120000 });
      logger.info(`Job ${job.id} mission terminée: ${res.text?.slice(0, 100)}`);
      return;
    }

    // Cas 2 : action: http → ping HTTP
    if (actionType === "http" && job.url) {
      const res = await fetch(job.url, { signal: AbortSignal.timeout(5000) });
      logger.info(`Job ${job.id} http: ${res.status} ${job.url}`);
      return;
    }

    // Cas 3 : intention computer-use (ouvre, lance, etc.)
    const isIntent = /ouvre|lance|mets|cherche|clique|tape|open|search/i.test(actionType);
    if (isIntent) {
      const { runIntentPipeline } = await import("./agents/intentPipeline.js");
      const result = await runIntentPipeline(actionType, {
        hudFn: (e) => logger.info(`HUD: ${JSON.stringify(e)}`),
      });
      const msg = `✅ Job *${job.id}*: ${result.goal} (${(result.duration / 1000).toFixed(1)}s)`;
      await alertTelegram(msg);
      logger.info(`Job ${job.id} terminé: ${result.success ? "succès" : "partiel"}`);

    } else {
      // Exécuter comme commandes système
      const { execa } = await import("execa");
      const lines = action.split("\n").filter(l => l.trim() && !l.trim().startsWith("#"));
      const results = [];

      for (const cmd of lines) {
        if (!cmd.trim()) continue;
        const { stdout, stderr, exitCode } = await execa("bash", ["-c", cmd], {
          cwd: ROOT, timeout: 60000, reject: false,
        });
        results.push({ cmd, ok: exitCode === 0, output: (stdout || stderr).slice(0, 200) });
        if (exitCode !== 0) logger.warn(`Job ${job.id} cmd failed: ${cmd}`);
      }

      const failed = results.filter(r => !r.ok).length;
      if (failed > 0) {
        await alertTelegram(`⚠️ Job *${job.id}*: ${failed}/${results.length} commandes échouées`);
      } else {
        logger.info(`Job ${job.id}: ${results.length} commandes OK`);
      }
    }

    // Sauvegarder l'historique
    const histPath = join(ROOT, ".laruche/cron_history.json");
    let history = [];
    try { history = JSON.parse(readFileSync(histPath, "utf-8")); } catch {}
    history.unshift({ id: job.id, ts: new Date().toISOString(), duration: Date.now() - startTime });
    writeFileSync(histPath, JSON.stringify(history.slice(0, 100), null, 2));

  } catch (e) {
    logger.error(`Job ${job.id} erreur: ${e.message}`);
    await alertTelegram(`❌ Job *${job.id}* erreur: ${e.message.slice(0, 100)}`);
  }
}

// ─── Chargement et planification ───────────────────────────────────────────────

export function startCronRunner() {
  const jobsPath = join(ROOT, "data/cron/jobs.yml");
  if (!existsSync(jobsPath)) {
    logger.info("Aucun fichier data/cron/jobs.yml — cron désactivé");
    return;
  }

  let jobs;
  try {
    jobs = parseJobsYaml(readFileSync(jobsPath, "utf-8"));
  } catch (e) {
    logger.error(`Erreur lecture jobs.yml: ${e.message}`);
    return;
  }

  logger.info(`${jobs.length} job(s) planifié(s)`);

  for (const job of jobs) {
    const schedule = job.schedule || job.cron;
    if (!schedule || !cron.validate(schedule)) {
      logger.warn(`Job ${job.id}: schedule invalide "${schedule}"`);
      continue;
    }

    cron.schedule(schedule, () => executeJob(job), { timezone: "Europe/Paris" });
    logger.info(`  ✓ ${job.id}: ${schedule} — ${job.action?.slice(0, 50) || job.mission?.slice(0, 50)}`);
  }
}
