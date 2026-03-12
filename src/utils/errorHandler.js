/**
 * errorHandler.js — Gestionnaire d'erreurs centralisé LaRuche
 *
 * Fournit :
 *   - ErrorCode  : codes d'erreur standardisés
 *   - LaRucheError : classe enrichie (code, mission_id, recoverable...)
 *   - handleError  : normalise + logue sans throw
 *
 * Utilisation :
 *   import { LaRucheError, ErrorCode, handleError } from '../utils/errorHandler.js';
 *
 *   throw new LaRucheError('Timeout LLM', {
 *     code: ErrorCode.LLM_TIMEOUT,
 *     mission_id,
 *     recoverable: false,
 *   });
 */

import { logger } from './logger.js';

// ─── Codes d'erreur standardisés ───────────────────────────────────────────────

export const ErrorCode = Object.freeze({
  // LLM
  LLM_TIMEOUT:       'LLM_TIMEOUT',
  LLM_ERROR:         'LLM_ERROR',
  LLM_PARSE_FAILED:  'LLM_PARSE_FAILED',
  // MCP
  MCP_CRASH:         'MCP_CRASH',
  MCP_TIMEOUT:       'MCP_TIMEOUT',
  MCP_NO_RESPONSE:   'MCP_NO_RESPONSE',
  // Skills
  SKILL_NOT_FOUND:   'SKILL_NOT_FOUND',
  SKILL_LOAD_FAILED: 'SKILL_LOAD_FAILED',
  // HITL
  HITL_REJECTED:     'HITL_REJECTED',
  HITL_TIMEOUT:      'HITL_TIMEOUT',
  // Config
  CONFIG_MISSING:    'CONFIG_MISSING',
  CONFIG_INVALID:    'CONFIG_INVALID',
  // Mission
  MISSION_FAILED:    'MISSION_FAILED',
  MISSION_TIMEOUT:   'MISSION_TIMEOUT',
  // Générique
  UNHANDLED:         'UNHANDLED',
});

// ─── Classe d'erreur LaRuche ───────────────────────────────────────────────────

export class LaRucheError extends Error {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.code]         Code ErrorCode.*
   * @param {string} [opts.mission_id]   Corrélation ID mission
   * @param {string} [opts.step_id]      Corrélation ID step
   * @param {string} [opts.tool]         Outil MCP concerné
   * @param {boolean}[opts.recoverable]  Si false, stoppe la mission
   * @param {object} [opts.context]      Contexte additionnel
   */
  constructor(message, opts = {}) {
    super(message);
    this.name        = 'LaRucheError';
    this.code        = opts.code        ?? ErrorCode.UNHANDLED;
    this.mission_id  = opts.mission_id  ?? null;
    this.step_id     = opts.step_id     ?? null;
    this.tool        = opts.tool        ?? null;
    this.recoverable = opts.recoverable ?? true;
    this.context     = opts.context     ?? {};
  }
}

// ─── Gestionnaire ───────────────────────────────────────────────────────────────

/**
 * Normalise une erreur en LaRucheError, la logue et la retourne.
 * Ne throw jamais — l'appelant décide quoi faire du résultat.
 *
 * @param {Error|LaRucheError} err
 * @param {object} [context]   Contexte supplémentaire (mission_id, component, tool...)
 * @returns {LaRucheError}
 */
export function handleError(err, context = {}) {
  const lrErr = (err instanceof LaRucheError)
    ? err
    : new LaRucheError(err.message, {
        code:        ErrorCode.UNHANDLED,
        recoverable: true,
        context:     { originalName: err.name },
        ...context,
      });

  logger.error({
    message:     lrErr.message,
    code:        lrErr.code,
    recoverable: lrErr.recoverable,
    mission_id:  lrErr.mission_id || context.mission_id || null,
    step_id:     lrErr.step_id    || context.step_id    || null,
    tool:        lrErr.tool       || context.tool       || null,
    component:   context.component || 'unknown',
    stack:       lrErr.stack,
    ...lrErr.context,
  });

  return lrErr;
}
