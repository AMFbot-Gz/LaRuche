/**
 * mission.js — Struct Mission centralisée LaRuche
 *
 * Source unique de vérité pour le cycle de vie d'une mission.
 * Toutes les mutations passent par les helpers ci-dessous (pattern immuable).
 *
 * Usage :
 *   import { createMission, finalizeMission } from '../types/mission.js';
 *
 *   const mission = createMission({ user_prompt: text, channel: 'telegram' });
 *   // ... exécution ...
 *   const done = finalizeMission(mission, { status: 'success', result: synthesis });
 *   saveMission(done);
 */

import { randomUUID } from 'crypto';

/**
 * Crée une nouvelle Mission avec les valeurs par défaut.
 *
 * @param {object} opts
 * @param {string} [opts.id]            UUID (généré si absent)
 * @param {string} opts.user_prompt
 * @param {string} [opts.channel]       'telegram'|'cli'|'rest'|'hud'
 * @param {string[]} [opts.allowed_tools] Vide = tous autorisés
 * @returns {Mission}
 */
export function createMission(opts = {}) {
  const id = opts.id || randomUUID();
  return {
    id,
    correlation_id:  opts.correlation_id || id,
    user_prompt:     opts.user_prompt    || '',
    channel:         opts.channel        || 'telegram',
    status:          'pending',
    plan:            null,       // { goal, tasks[] } — rempli par butterflyLoop/planner
    steps:           [],         // MissionStep[] — rempli par intentPipeline
    allowed_tools:   opts.allowed_tools || [],
    models_used:     [],
    started_at:      new Date().toISOString(),
    completed_at:    null,
    duration_ms:     null,
    result:          null,
    error:           null,
  };
}

/**
 * Retourne une copie mise à jour.
 * Toujours utiliser cette fonction — ne jamais muter directement.
 *
 * @param {Mission} mission
 * @param {Partial<Mission>} patch
 * @returns {Mission}
 */
export function updateMissionState(mission, patch) {
  return { ...mission, ...patch };
}

/**
 * Ajoute un step (MCP tool call, skill exécuté).
 *
 * @param {Mission} mission
 * @param {object}  step
 * @param {string}  step.skill
 * @param {object}  step.params
 * @param {any}     step.result
 * @param {boolean} step.success
 * @param {number}  [step.duration_ms]
 * @param {boolean} [step.hitl_approved]
 * @returns {Mission}
 */
export function addMissionStep(mission, step) {
  return {
    ...mission,
    steps: [
      ...mission.steps,
      {
        skill:         step.skill         || 'unknown',
        params:        step.params        || {},
        result:        step.result        ?? null,
        success:       step.success       ?? true,
        duration_ms:   step.duration_ms   ?? null,
        hitl_approved: step.hitl_approved ?? null,
        ts:            new Date().toISOString(),
      },
    ],
  };
}

/**
 * Ajoute un modèle à la liste des modèles utilisés (dédupliqué).
 *
 * @param {Mission} mission
 * @param {string}  model
 * @returns {Mission}
 */
export function addModelUsed(mission, model) {
  if (!model || mission.models_used.includes(model)) return mission;
  return { ...mission, models_used: [...mission.models_used, model] };
}

/**
 * Finalise une mission (succès ou erreur).
 * Calcule automatiquement duration_ms et completed_at.
 *
 * @param {Mission} mission
 * @param {object}  patch   { status, result?, error? }
 * @returns {Mission}
 */
export function finalizeMission(mission, patch = {}) {
  return updateMissionState(mission, {
    completed_at: new Date().toISOString(),
    duration_ms:  Date.now() - new Date(mission.started_at).getTime(),
    ...patch,
  });
}

/**
 * Retourne un résumé lisible pour les logs.
 *
 * @param {Mission} mission
 * @returns {string}
 */
export function missionSummary(mission) {
  const dur = mission.duration_ms ? `${(mission.duration_ms / 1000).toFixed(1)}s` : 'en cours';
  const models = mission.models_used.join(', ') || 'aucun';
  return `[${mission.id.slice(0, 8)}] ${mission.status} | ${dur} | ${models} | steps: ${mission.steps.length}`;
}
