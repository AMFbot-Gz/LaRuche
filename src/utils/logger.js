/**
 * logger.js — Logger centralisé LaRuche
 *
 * Remplace les winston.createLogger() dispersés dans chaque module.
 * Format JSON structuré avec champs de corrélation (mission_id, step_id, component).
 *
 * Usage :
 *   import { logger, createContextLogger } from '../utils/logger.js';
 *   const log = createContextLogger('model_router', mission_id);
 *   log.info({ message: 'llm_call', model, duration_ms });
 */

import winston from 'winston';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const LOG_DIR = join(ROOT, '.laruche/logs');
mkdirSync(LOG_DIR, { recursive: true });

// ─── Formats ──────────────────────────────────────────────────────────────────

// JSON pur pour les fichiers (aggregable par Loki/Splunk/grep)
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Lisible avec couleurs pour la console
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, mission_id, component, step_id }) => {
    const id  = mission_id  ? ` [${String(mission_id).slice(0, 8)}]`  : '';
    const sid = step_id     ? ` <${step_id}>`                          : '';
    const comp = component  ? ` {${component}}`                        : '';
    return `[${timestamp}]${id}${sid}${comp} ${level}: ${typeof message === 'object' ? JSON.stringify(message) : message}`;
  })
);

// ─── Logger principal ─────────────────────────────────────────────────────────

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'laruche' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: join(LOG_DIR, 'queen.log'),
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: join(LOG_DIR, 'errors.log'),
      level: 'error',
      format: jsonFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
  ],
});

/**
 * Crée un logger fils avec contexte pré-rempli.
 * Appeler une seule fois par module/requête, puis utiliser partout.
 *
 * @param {string} component   Nom du module (ex: 'model_router', 'intentPipeline')
 * @param {string} [mission_id]
 * @param {string} [step_id]
 */
export function createContextLogger(component, mission_id, step_id) {
  return logger.child({
    component,
    ...(mission_id ? { mission_id } : {}),
    ...(step_id    ? { step_id    } : {}),
  });
}

export default logger;
