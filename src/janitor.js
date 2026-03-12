/**
 * janitor.js — Janitor Pro LaRuche
 * Purge /temp, rotation logs, GC mémoire, TTL skills
 *
 * fix(C2): remplacement de require() (CommonJS) par import() dynamique (ESM)
 * fix(C3): suppression de better-sqlite3 (non installé) — shadow-errors.db non utilisé
 */

import cron from 'node-cron';
import { readdirSync, rmSync, statSync, mkdirSync } from 'fs';
import { rm } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TEMP_DIR         = join(ROOT, '.laruche/temp');
const LOGS_DIR         = join(ROOT, '.laruche/logs');
const LOG_TTL_HOURS    = parseInt(process.env.LOG_TTL_HOURS           || '24',  10);
const TEMP_PURGE_MIN   = parseInt(process.env.TEMP_PURGE_INTERVAL_MIN || '10',  10);
const LOG_MAX_SIZE_MB  = parseInt(process.env.LOG_MAX_SIZE_MB          || '10',  10);
const ROLLBACK_TTL_DAYS = parseInt(process.env.ROLLBACK_TTL_DAYS       || '7',   10);

mkdirSync(TEMP_DIR, { recursive: true });

// ─── Purge /temp ───────────────────────────────────────────────────────────────────
export async function purgeTemp() {
  try {
    const files = readdirSync(TEMP_DIR);
    const results = await Promise.all(
      files
        .filter(f => f !== '.gitkeep')
        .map(f => rm(join(TEMP_DIR, f), { recursive: true, force: true })
          .then(() => 1).catch(() => 0))
    );
    const purged = results.reduce((a, b) => a + b, 0);
    if (purged > 0) logger.info({ message: `Purge /temp: ${purged} fichier(s)`, component: 'janitor' });
  } catch (e) {
    logger.error({ message: `purgeTemp: ${e.message}`, component: 'janitor' });
  }
}

// ─── Rotation logs ─────────────────────────────────────────────────────────────────
export function rotateLogs() {
  try {
    const files = readdirSync(LOGS_DIR);
    let rotated = 0;
    for (const f of files) {
      if (!f.endsWith('.log')) continue;
      const fullPath = join(LOGS_DIR, f);
      try {
        const stat = statSync(fullPath);
        const sizeMB = stat.size / (1024 * 1024);
        if (sizeMB > LOG_MAX_SIZE_MB) {
          const bakPath = `${fullPath}.${Date.now()}.bak`;
          rmSync(bakPath, { force: true });
          logger.info({ message: `Log rotaté: ${f} (${sizeMB.toFixed(1)}MB)`, component: 'janitor' });
          rotated++;
        }
      } catch { /* skip */ }
    }
    if (rotated > 0) logger.info({ message: `Rotation logs: ${rotated} fichier(s)`, component: 'janitor' });
  } catch (e) {
    logger.error({ message: `rotateLogs: ${e.message}`, component: 'janitor' });
  }
}

// ─── GC RAM ─────────────────────────────────────────────────────────────────────────export function gcRAM() {
  if (global.gc) {
    global.gc();
    logger.info({ message: 'GC RAM forcée', component: 'janitor' });
  }
}

// ─── Purge snapshots rollback ──────────────────────────────────────────────────
async function purgeOldSnapshots() {
  try {
    const ROLLBACK_DIR = join(ROOT, '.laruche/rollback');
    const cutoff = Date.now() - ROLLBACK_TTL_DAYS * 24 * 60 * 60 * 1000;
    const dirs = readdirSync(ROLLBACK_DIR).filter(d => {
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
      } catch { /* skip */ }
    }
    if (purged > 0) logger.info({ message: `Snapshots purgés: ${purged}`, component: 'janitor' });
  } catch (e) {
    logger.error({ message: `purgeOldSnapshots: ${e.message}`, component: 'janitor' });
  }
}

// ─── Purge skills TTL expirés ──────────────────────────────────────────────────
// fix(C2): remplacement require() (crash ESM) → import() dynamique
async function deleteExpiredSkills() {
  try {
    const { listSkills } = await import('./skill_evolution.js');
    const skills = listSkills();
    let deleted = 0;
    for (const skill of skills) {
      if (skill.ttl && skill.ttl < Date.now()) {
        logger.info({ message: `Skill TTL expiré: ${skill.name}`, component: 'janitor' });
        deleted++;
      }
    }
    if (deleted > 0) logger.info({ message: `Skills expirés: ${deleted}`, component: 'janitor' });
  } catch { /* non-fatal */ }
}

// ─── Crons ────────────────────────────────────────────────────────────────────────

// Purge /temp toutes les N minutes
cron.schedule(`*/${TEMP_PURGE_MIN} * * * *`, () => { purgeTemp(); });

// Rotation logs quotidienne à minuit
cron.schedule('0 0 * * *', () => { rotateLogs(); });

// Purge snapshots anciens tous les jours à 3h00
cron.schedule('0 3 * * *', async () => { await purgeOldSnapshots(); });

// Purge skills TTL une fois par heure
cron.schedule('0 * * * *', async () => { await deleteExpiredSkills(); });

// GC RAM si usage > 400MB (toutes les 5 minutes)
cron.schedule('*/5 * * * *', () => {
  const mem = process.memoryUsage();
  const heapMB = mem.heapUsed / (1024 * 1024);
  if (heapMB > 400) {
    logger.warn({ message: `RAM haute (${heapMB.toFixed(0)}MB) — GC forcée`, component: 'janitor' });
    gcRAM();
  }
});

logger.info({ message: 'Janitor Pro démarré — crons actifs', component: 'janitor' });

export { purgeTemp, rotateLogs, gcRAM };
