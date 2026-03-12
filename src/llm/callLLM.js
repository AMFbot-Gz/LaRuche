/**
 * callLLM.js — Helper centralisé pour appels LLM avec retry
 * Exponential backoff: 1s, 2s — Logs structurés avec correlation IDs
 */
import { ask } from '../model_router.js';
import { logger } from '../utils/logger.js';
import { LaRucheError, ErrorCode } from '../utils/errorHandler.js';

const MAX_RETRIES = parseInt(process.env.LLM_MAX_RETRIES || '2');
const BASE_DELAY_MS = parseInt(process.env.LLM_BASE_DELAY_MS || '1000');

/**
 * Appel LLM avec retry exponentiel et logs structurés.
 *
 * @param {string} prompt
 * @param {object} [options]
 * @param {string} [options.role] - strategist | worker | architect | synthesizer | vision
 * @param {number} [options.temperature]
 * @param {string} [options.mission_id]
 * @param {string} [options.step_id]
 * @returns {Promise<{text: string, model: string, usage?: object}>}
 * @throws {LaRucheError} LLM_TIMEOUT si tous les essais échouent
 */
export async function callLLM(prompt, options = {}) {
  const { mission_id, step_id, role, temperature } = options;
  const callId = `llm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const t0 = Date.now();
    try {
      const result = await ask(prompt, { role, temperature });
      logger.info('llm_call_success', {
        call_id: callId,
        mission_id,
        step_id,
        role,
        model: result.model,
        attempt,
        duration_ms: Date.now() - t0,
        prompt_preview: prompt.slice(0, 80),
      });
      return result;
    } catch (err) {
      const duration_ms = Date.now() - t0;
      if (attempt > MAX_RETRIES) {
        logger.error('llm_call_failed', {
          call_id: callId, mission_id, step_id, role, attempt, duration_ms, error: err.message,
        });
        throw new LaRucheError(
          ErrorCode.LLM_TIMEOUT,
          `LLM non disponible après ${MAX_RETRIES + 1} tentatives: ${err.message}`,
          { mission_id, step_id, recoverable: false }
        );
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.warn('llm_call_retry', {
        call_id: callId, mission_id, step_id, role, attempt, duration_ms,
        retry_in_ms: delay, error: err.message,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
