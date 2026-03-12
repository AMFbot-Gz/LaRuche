/**
 * callLLM.js — Helper LLM centralisé avec retry et corrélation IDs
 *
 * Wrapper autour de model_router.ask() qui ajoute :
 *   - Retry exponentiel (2 tentatives par défaut)
 *   - Logs structurés avec mission_id / step_id
 *   - Erreurs typées LaRucheError
 *
 * Usage :
 *   import { callLLM } from '../llm/callLLM.js';
 *   const result = await callLLM(prompt, { role: 'strategist', mission_id });
 */

import { ask } from '../model_router.js';
import { createContextLogger } from '../utils/logger.js';
import { LaRucheError, ErrorCode } from '../utils/errorHandler.js';

const DEFAULT_RETRIES     = 2;
const DEFAULT_TIMEOUT_MS  = 60_000;
const DEFAULT_TEMPERATURE = 0.3;

/**
 * Appel LLM avec retry exponentiel et logs structurés.
 *
 * @param {string} prompt
 * @param {object} [opts]
 * @param {string}  [opts.role='worker']       Rôle agent
 * @param {string}  [opts.mission_id]          ID de mission pour corrélation
 * @param {string}  [opts.step_id]             ID de step pour corrélation
 * @param {string}  [opts.component='callLLM'] Composant appelant (pour les logs)
 * @param {number}  [opts.retries=2]           Nombre de retry après 1er échec
 * @param {number}  [opts.timeout=60000]       Timeout en ms par tentative
 * @param {number}  [opts.temperature=0.3]
 * @returns {Promise<{ text: string, model: string, success: true }>}
 * @throws {LaRucheError}  code LLM_ERROR | LLM_TIMEOUT si tous les retries échouent
 */
export async function callLLM(prompt, opts = {}) {
  const {
    role        = 'worker',
    mission_id,
    step_id,
    component   = 'callLLM',
    retries     = DEFAULT_RETRIES,
    timeout     = DEFAULT_TIMEOUT_MS,
    temperature = DEFAULT_TEMPERATURE,
  } = opts;

  const log = createContextLogger(component, mission_id, step_id);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const result = await ask(prompt, { role, temperature, timeout });

      if (!result.success) {
        throw new LaRucheError(result.error || 'LLM returned failure', {
          code: ErrorCode.LLM_ERROR,
          mission_id,
          step_id,
          recoverable: true,
        });
      }

      log.info({
        message:        'llm_call_success',
        event:          'llm_success',
        model:          result.model,
        role,
        duration_ms:    Date.now() - t0,
        attempt,
        prompt_chars:   prompt.length,
        response_chars: result.text?.length ?? 0,
      });

      return result;

    } catch (err) {
      lastError = err;
      const isLast = attempt >= retries;

      log.warn({
        message:    'llm_call_failed',
        event:      'llm_retry',
        role,
        attempt,
        retries,
        will_retry: !isLast,
        error:      err.message,
        duration_ms: Date.now() - t0,
      });

      if (!isLast) {
        // Backoff exponentiel : 1s, 2s, 4s...
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw new LaRucheError(
    `LLM call failed after ${retries + 1} attempt(s): ${lastError?.message}`,
    {
      code:        ErrorCode.LLM_TIMEOUT,
      mission_id,
      step_id,
      recoverable: false,
    }
  );
}
