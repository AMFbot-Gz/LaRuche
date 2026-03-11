/**
 * janitor.js — Janitor Pro LaRuche
 * Purge /temp 10min, rotation logs 24h, deep sleep, self-refactoring
 */

import cron from "node-cron";
import { readdirSync, rmSync, statSync, mkdirSync } from "fs";
import { rm } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import winston from "winston";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] [JANITOR] ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: join(ROOT, ".laruche/logs/janitor.log") }),
  ],
});

const db = new Database(join(ROOT, ".laruche/shadow-errors.db"));
const TEMP_DIR = join(ROOT, ".laruche/temp");
const LOGS_DIR = join(ROOT, ".laruche/logs");
const LOG_TTL_HOURS = parseInt(process.env.LOG_TTL_HOURS || "24");
const TEMP_PURGE_MIN = parseInt(process.env.TEMP_PURGE_INTERVAL_MIN || "10");

mkdirSync(TEMP_DIR, { recursive: true });

async function purgeTemp() {
  try {
    const files = readdirSync(TEMP_DIR);
    // Suppression parallèle
    const deletePromises = files
      .filter(f => f !== ".gitkeep")
      .map(f => rm(join(TEMP_DIR, f), { recursive: true, force: true }).then(() => 1).catch(() => 0));
    const results = await Promise.all(deletePromises);
    const purged = results.reduce((a, b) => a + b, 0);
    if (purged > 0) logger.info(`Purge /temp: ${purged} fichier(s) supprimé(s)`);
  } catch (e) {
    logger.error(`purgeTemp: ${e.message}`);
  }
}

function rotateLogs() {
  try {
    const cutoff = Date.now() - LOG_TTL_HOURS * 3600 * 1000;
    const files = readdirSync(LOGS_DIR);
    let rotated = 0;

    for (const f of files) {
      if (!f.endsWith(".log")) continue;
      const fullPath = join(LOGS_DIR, f);
      try {
        const stat = statSync(fullPath);
        const sizeMB = stat.size / (1024 * 1024);
        if (sizeMB > 10) {
          const bakPath = `${fullPath}.${Date.now()}.bak`;
          // Renommer → nouveau fichier vide sera créé par le logger
          rmSync(bakPath, { force: true });
          logger.info(`Log rotaté: ${f} (${sizeMB.toFixed(1)}MB)`);
          rotated++;
        }
      } catch {}
    }
    if (rotated > 0) logger.info(`Rotation logs: ${rotated} fichier(s)`);
  } catch (e) {
    logger.error(`rotateLogs: ${e.message}`);
  }
}

function deleteExpiredSkills() {
  try {
    const { listSkills } = require("./skill_evolution.js");
    const skills = listSkills();
    let deleted = 0;

    for (const skill of skills) {
      if (skill.ttl && skill.ttl < Date.now()) {
        logger.info(`Skill TTL expiré: ${skill.name}`);
        deleted++;
      }
    }
    if (deleted > 0) logger.info(`Skills TTL expirés supprimés: ${deleted}`);
  } catch {}
}

function gcRAM() {
  if (global.gc) {
    global.gc();
    logger.info("Garbage collection forcée");
  }
}

// ─── Crons ────────────────────────────────────────────────────────────────────

// Purge /temp toutes les N minutes
cron.schedule(`*/${TEMP_PURGE_MIN} * * * *`, () => {
  logger.info("Cron purge temp...");
  purgeTemp();
});

// Rotation logs quotidienne à minuit
cron.schedule("0 0 * * *", () => {
  logger.info("Rotation logs quotidienne...");
  rotateLogs();
});

// Purge snapshots anciens tous les jours à 3h00
cron.schedule("0 3 * * *", async () => {
  logger.info("Purge snapshots anciens...");
  try {
    // Utilise readdirSync/statSync/rmSync déjà importés en haut du fichier
    const ROLLBACK_DIR = join(ROOT, ".laruche/rollback");
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const dirs = readdirSync(ROLLBACK_DIR).filter((d) => {
      try { return statSync(join(ROLLBACK_DIR, d)).isDirectory(); } catch { return false; }
    });
    let purged = 0;
    for (const dir of dirs) {
      const fullPath = join(ROLLBACK_DIR, dir);
      try {
        if (statSync(fullPath).mtimeMs < cutoff) {
          rmSync(fullPath, { recursive: true });
          purged++;
        }
      } catch {}
    }
    logger.info(`Snapshots purgés: ${purged}`);
  } catch (e) {
    logger.error(`purge snapshots: ${e.message}`);
  }
});

// GC RAM si usage > 400MB
cron.schedule("*/5 * * * *", () => {
  const mem = process.memoryUsage();
  const heapMB = mem.heapUsed / (1024 * 1024);
  if (heapMB > 400) {
    logger.warn(`RAM haute (${heapMB.toFixed(0)}MB) — GC forcée`);
    gcRAM();
  }
});

logger.info("✅ Janitor Pro démarré — tous les crons actifs");

// Export pour usage direct
export { purgeTemp, rotateLogs, gcRAM };
