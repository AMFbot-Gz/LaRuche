/**
 * logger.js — Logger centralisé LaRuche v4.1
 * Format JSON Winston avec rotation + child loggers par composant/mission/step
 */
import { createLogger, format, transports } from 'winston';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const LOG_DIR = join(ROOT, '.laruche/logs');
mkdirSync(LOG_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = format;

// Format console lisible
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, component, mission_id, step_id, stack }) => {
    const ctx = [component, mission_id?.slice(0, 8), step_id].filter(Boolean).join(':');
    return `${timestamp} [${level}]${ctx ? ` [${ctx}]` : ''} ${stack || message}`;
  })
);

// Format JSON pour fichiers
const jsonFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json()
);

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'laruche' },
  transports: [
    new transports.Console({ format: consoleFormat }),
    new transports.File({
      filename: join(LOG_DIR, 'queen.log'),
      format: jsonFormat,
      maxsize: parseInt(process.env.LOG_MAX_SIZE_MB || '10') * 1024 * 1024,
      maxFiles: 3,
      tailable: true,
    }),
    new transports.File({
      filename: join(LOG_DIR, 'errors.log'),
      format: jsonFormat,
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 2,
    }),
  ],
});

/**
 * Crée un child logger avec contexte fixe (component, mission_id, step_id)
 * @param {string} component
 * @param {string} [mission_id]
 * @param {string} [step_id]
 */
export function createContextLogger(component, mission_id, step_id) {
  return logger.child({
    component,
    ...(mission_id && { mission_id }),
    ...(step_id && { step_id }),
  });
}

export default logger;
