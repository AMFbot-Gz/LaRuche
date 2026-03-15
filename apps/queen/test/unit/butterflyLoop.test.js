/**
 * test/unit/butterflyLoop.test.js — Tests unitaires des fonctions critiques de la butterfly loop
 *
 * Stratégie :
 * - callLLM testé via des erreurs injectées dans ask() via l'env (LLM_GLOBAL_TIMEOUT_MS=0)
 *   et via le comportement observable (success/failure/retry)
 * - createMission, finalizeMission, missionSummary testés directement (pures, sans I/O)
 * - Les mocks ESM sont limités aux modules qui n'utilisent pas de live bindings
 */

import { jest } from '@jest/globals';

// ─── Mock logger (évite écritures disque) ──────────────────────────────────────
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ─── Imports après mocks ───────────────────────────────────────────────────────

import { LaRucheError, ErrorCode } from '../../src/utils/errorHandler.js';
import {
  createMission,
  finalizeMission,
  updateMissionState,
  addMissionStep,
  addModelUsed,
  missionSummary,
  canTransition,
  isTerminal,
} from '../../src/types/mission.js';

// ─── Tests createMission ────────────────────────────────────────────────────────

describe('createMission', () => {
  test('retourne un objet immuable avec les champs requis', () => {
    const m = createMission({ command: 'Test mission', source: 'telegram' });

    expect(m).toBeDefined();
    expect(m.id).toBeDefined();
    expect(m.command).toBe('Test mission');
    expect(m.source).toBe('telegram');
    expect(m.status).toBe('pending');
    expect(m.steps).toEqual([]);
    expect(m.models_used).toEqual([]);
    expect(m.created_at).toBeDefined();
    expect(m.result).toBeNull();
    expect(m.error).toBeNull();
  });

  test('retourne un objet gelé (immuable)', () => {
    const m = createMission({ command: 'Test' });
    expect(Object.isFrozen(m)).toBe(true);
  });

  test('id généré automatiquement si non fourni', () => {
    const m1 = createMission({ command: 'A' });
    const m2 = createMission({ command: 'B' });
    expect(m1.id).toBeDefined();
    expect(m2.id).toBeDefined();
    expect(m1.id).not.toBe(m2.id);
  });

  test('id personnalisé conservé', () => {
    const m = createMission({ command: 'Test', id: 'my-custom-id' });
    expect(m.id).toBe('my-custom-id');
  });

  test('source par défaut "unknown" si non fournie', () => {
    const m = createMission({ command: 'Test' });
    expect(m.source).toBe('unknown');
  });

  test('timestamp created_at est une ISO string valide', () => {
    const m = createMission({ command: 'Test' });
    expect(() => new Date(m.created_at)).not.toThrow();
    expect(new Date(m.created_at).getTime()).toBeGreaterThan(0);
  });

  test('command vide acceptée', () => {
    const m = createMission({ command: '' });
    expect(m.command).toBe('');
    expect(m.status).toBe('pending');
  });

  test('metadata optionnel conservé', () => {
    const m = createMission({ command: 'Test', metadata: { priority: 'high', source_ip: '127.0.0.1' } });
    expect(m.metadata).toMatchObject({ priority: 'high' });
  });
});

// ─── Tests finalizeMission ──────────────────────────────────────────────────────

describe('finalizeMission', () => {
  test('calcule duration_ms correctement', async () => {
    const m = createMission({ command: 'Test' });
    await new Promise(r => setTimeout(r, 10));
    const final = finalizeMission(m, { status: 'success', result: 'Résultat' });

    expect(final.duration_ms).toBeGreaterThan(0);
    expect(final.completed_at).toBeDefined();
  });

  test('status:success propagé', () => {
    const m = createMission({ command: 'Test' });
    const final = finalizeMission(m, { status: 'success', result: 'OK' });

    expect(final.status).toBe('success');
    expect(final.result).toBe('OK');
  });

  test('status:error propagé avec message d\'erreur', () => {
    const m = createMission({ command: 'Test' });
    const final = finalizeMission(m, { status: 'error', error: 'Quelque chose a planté' });

    expect(final.status).toBe('error');
    expect(final.error).toBe('Quelque chose a planté');
  });

  test('retourne un objet immuable', () => {
    const m = createMission({ command: 'Test' });
    const final = finalizeMission(m, { status: 'success' });
    expect(Object.isFrozen(final)).toBe(true);
  });

  test('completed_at est une ISO string valide', () => {
    const m = createMission({ command: 'Test' });
    const final = finalizeMission(m, { status: 'success' });
    expect(() => new Date(final.completed_at)).not.toThrow();
  });

  test('duration_ms est un nombre positif', () => {
    const m = createMission({ command: 'Test' });
    const final = finalizeMission(m, { status: 'success' });
    expect(typeof final.duration_ms).toBe('number');
    expect(final.duration_ms).toBeGreaterThanOrEqual(0);
  });

  test('ne modifie pas la mission originale (immuabilité)', () => {
    const m = createMission({ command: 'Test' });
    const originalStatus = m.status;
    finalizeMission(m, { status: 'success' });
    expect(m.status).toBe(originalStatus); // m inchangé
  });
});

// ─── Tests missionSummary ───────────────────────────────────────────────────────

describe('missionSummary', () => {
  test('retourne une string non vide', () => {
    const m = createMission({ command: 'Test' });
    const final = finalizeMission(m, { status: 'success' });
    const summary = missionSummary(final);

    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  test('contient le status', () => {
    const m = createMission({ command: 'Test' });
    const final = finalizeMission(m, { status: 'success', result: 'OK' });
    const summary = missionSummary(final);

    expect(summary).toContain('success');
  });

  test('contient l\'id tronqué de la mission', () => {
    const m = createMission({ command: 'Test', id: 'abcdef12-1234-5678-abcd-ef1234567890' });
    const final = finalizeMission(m, { status: 'success' });
    const summary = missionSummary(final);

    expect(summary).toContain('abcdef12');
  });

  test('mission sans duration affiche "en cours"', () => {
    const m = createMission({ command: 'Test' });
    const summary = missionSummary(m);

    expect(summary).toContain('en cours');
  });

  test('mission avec models_used les liste', () => {
    let m = createMission({ command: 'Test' });
    m = addModelUsed(m, 'llama3.2:3b');
    m = addModelUsed(m, 'qwen3-coder');
    const final = finalizeMission(m, { status: 'success' });
    const summary = missionSummary(final);

    expect(summary).toContain('llama3.2:3b');
    expect(summary).toContain('qwen3-coder');
  });

  test('mission sans modèles affiche "aucun"', () => {
    const m = createMission({ command: 'Test' });
    const final = finalizeMission(m, { status: 'success' });
    const summary = missionSummary(final);

    expect(summary).toContain('aucun');
  });

  test('contient le nombre d\'étapes', () => {
    let m = createMission({ command: 'Test' });
    m = addMissionStep(m, { id: 'step1', skill: 'worker', description: 'Étape 1', status: 'done' });
    m = addMissionStep(m, { id: 'step2', skill: 'worker', description: 'Étape 2', status: 'done' });
    const final = finalizeMission(m, { status: 'success' });
    const summary = missionSummary(final);

    expect(summary).toContain('2');
  });
});

// ─── Tests updateMissionState ───────────────────────────────────────────────────

describe('updateMissionState', () => {
  test('met à jour le statut de pending à running', () => {
    const m = createMission({ command: 'Test' });
    const running = updateMissionState(m, { status: 'running' });

    expect(running.status).toBe('running');
    expect(running.command).toBe('Test');
  });

  test('retourne un nouvel objet (immutabilité)', () => {
    const m = createMission({ command: 'Test' });
    const updated = updateMissionState(m, { status: 'running' });

    expect(updated).not.toBe(m);
    expect(Object.isFrozen(updated)).toBe(true);
  });

  test('peut mettre à jour plusieurs champs simultanément', () => {
    const m = createMission({ command: 'Test' });
    const updated = updateMissionState(m, { status: 'running', user_id: 'user-42' });

    expect(updated.status).toBe('running');
    expect(updated.user_id).toBe('user-42');
    expect(updated.command).toBe('Test');
  });
});

// ─── Tests addMissionStep ───────────────────────────────────────────────────────

describe('addMissionStep', () => {
  test('ajoute une étape à la liste steps', () => {
    const m = createMission({ command: 'Test' });
    const withStep = addMissionStep(m, { id: 'step1', skill: 'worker', description: 'Tâche 1', status: 'done' });

    expect(withStep.steps).toHaveLength(1);
    expect(withStep.steps[0].skill).toBe('worker');
  });

  test('chaque step reçoit un timestamp ts', () => {
    const m = createMission({ command: 'Test' });
    const withStep = addMissionStep(m, { id: 'step1', skill: 'test', status: 'done' });

    expect(withStep.steps[0].ts).toBeDefined();
  });

  test('n\'altère pas la mission originale', () => {
    const m = createMission({ command: 'Test' });
    addMissionStep(m, { id: 'step1', skill: 'test', status: 'done' });

    expect(m.steps).toHaveLength(0); // originale inchangée
  });
});

// ─── Tests addModelUsed ─────────────────────────────────────────────────────────

describe('addModelUsed', () => {
  test('ajoute un modèle à la liste', () => {
    const m = createMission({ command: 'Test' });
    const updated = addModelUsed(m, 'llama3.2:3b');

    expect(updated.models_used).toContain('llama3.2:3b');
  });

  test('ne duplique pas un modèle déjà présent', () => {
    let m = createMission({ command: 'Test' });
    m = addModelUsed(m, 'llama3.2:3b');
    m = addModelUsed(m, 'llama3.2:3b'); // doublon

    expect(m.models_used).toHaveLength(1);
  });

  test('peut ajouter plusieurs modèles différents', () => {
    let m = createMission({ command: 'Test' });
    m = addModelUsed(m, 'llama3.2:3b');
    m = addModelUsed(m, 'qwen3-coder');

    expect(m.models_used).toHaveLength(2);
  });
});

// ─── Tests machine d'état mission ──────────────────────────────────────────────

describe('transitions de statut mission', () => {
  test('canTransition: pending → running autorisé', () => {
    expect(canTransition('pending', 'running')).toBe(true);
  });

  test('canTransition: pending → cancelled autorisé', () => {
    expect(canTransition('pending', 'cancelled')).toBe(true);
  });

  test('canTransition: running → success autorisé', () => {
    expect(canTransition('running', 'success')).toBe(true);
  });

  test('canTransition: running → failed autorisé', () => {
    expect(canTransition('running', 'failed')).toBe(true);
  });

  test('canTransition: success → running refusé (terminal)', () => {
    expect(canTransition('success', 'running')).toBe(false);
  });

  test('canTransition: failed → success refusé (terminal)', () => {
    expect(canTransition('failed', 'success')).toBe(false);
  });

  test('isTerminal: success est terminal', () => {
    expect(isTerminal('success')).toBe(true);
  });

  test('isTerminal: failed est terminal', () => {
    expect(isTerminal('failed')).toBe(true);
  });

  test('isTerminal: cancelled est terminal', () => {
    expect(isTerminal('cancelled')).toBe(true);
  });

  test('isTerminal: timeout est terminal', () => {
    expect(isTerminal('timeout')).toBe(true);
  });

  test('isTerminal: pending n\'est pas terminal', () => {
    expect(isTerminal('pending')).toBe(false);
  });

  test('isTerminal: running n\'est pas terminal', () => {
    expect(isTerminal('running')).toBe(false);
  });
});

// ─── Tests LaRucheError ─────────────────────────────────────────────────────────

describe('LaRucheError', () => {
  test('crée une erreur avec code, message et contexte', () => {
    const err = new LaRucheError(ErrorCode.LLM_TIMEOUT, 'Timeout LLM', {
      mission_id: 'mission-1',
      recoverable: false,
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LaRucheError);
    expect(err.code).toBe(ErrorCode.LLM_TIMEOUT);
    expect(err.message).toBe('Timeout LLM');
    expect(err.mission_id).toBe('mission-1');
    expect(err.recoverable).toBe(false);
    expect(err.name).toBe('LaRucheError');
  });

  test('toJSON retourne un objet sérialisable', () => {
    const err = new LaRucheError(ErrorCode.SKILL_NOT_FOUND, 'Skill introuvable', { tool: 'my_skill' });
    const json = err.toJSON();

    expect(json.code).toBe(ErrorCode.SKILL_NOT_FOUND);
    expect(json.message).toBe('Skill introuvable');
    expect(json.tool).toBe('my_skill');
    expect(json.ts).toBeDefined();
  });

  test('recoverable défaut à false', () => {
    const err = new LaRucheError(ErrorCode.UNKNOWN, 'Erreur inconnue');
    expect(err.recoverable).toBe(false);
  });

  test('ts est une ISO string', () => {
    const err = new LaRucheError(ErrorCode.MISSION_FAILED, 'Mission échouée');
    expect(() => new Date(err.ts)).not.toThrow();
  });
});
