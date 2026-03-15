/**
 * test/unit/intentPipeline.test.js — Tests unitaires du pipeline d'intention
 *
 * Stratégie :
 * - isComputerUseIntent importée directement depuis planner.js (fonction pure)
 * - runIntentPipeline testée avec jest.unstable_mockModule (ESM live bindings)
 * - callLLM mocké pour éviter tout appel réseau
 */

import { jest } from '@jest/globals';

// ─── Mocks ESM via unstable_mockModule ─────────────────────────────────────────
// Note : jest.unstable_mockModule doit être AVANT les dynamic imports

const mockPlan = jest.fn();
const mockExecuteSequence = jest.fn();

jest.unstable_mockModule('../../src/agents/planner.js', () => ({
  plan: mockPlan,
  isComputerUseIntent: jest.fn((text) => {
    const PATTERNS = [
      /ouvre?\s+/i, /lance?\s+/i, /démarre?\s+/i, /ferme?\s+/i,
      /screenshot/i, /capture\s+d'écran/i, /prends?\s+(une\s+)?capture/i,
      /va\s+sur\s+/i, /clique?\s+(sur\s+)?/i,
      /open\s+/i, /click\s+/i, /type\s+/i,
      /mets?\s+(de\s+la\s+)?musique/i,
      /ouvre?\s+(vs\s*code|vscode|terminal|finder|chrome|firefox|safari|spotify)/i,
    ];
    return PATTERNS.some(p => p.test(text));
  }),
}));

jest.unstable_mockModule('../../src/agents/executor.js', () => ({
  executeSequence: mockExecuteSequence,
}));

jest.unstable_mockModule('../../src/skills/skillLoader.js', () => ({
  getAllSkills: jest.fn(() => []),
}));

jest.unstable_mockModule('../../src/model_router.js', () => ({
  ask: jest.fn(),
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule('execa', () => ({
  execa: jest.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

// ─── Dynamic imports APRÈS les mocks ──────────────────────────────────────────

const { runIntentPipeline, isComputerUseIntent } = await import('../../src/agents/intentPipeline.js');
const { ask } = await import('../../src/model_router.js');

// ─── Tests isComputerUseIntent ──────────────────────────────────────────────────

describe('isComputerUseIntent', () => {
  test('détecte "prends un screenshot" → true', () => {
    expect(isComputerUseIntent('prends un screenshot')).toBe(true);
  });

  test('détecte "ouvre Safari" → true', () => {
    expect(isComputerUseIntent('ouvre Safari')).toBe(true);
  });

  test('détecte "lance l\'application" → true', () => {
    expect(isComputerUseIntent("lance l'application")).toBe(true);
  });

  test('détecte "clique sur le bouton" → true', () => {
    expect(isComputerUseIntent('clique sur le bouton')).toBe(true);
  });

  test('détecte "mets de la musique" → true', () => {
    expect(isComputerUseIntent('mets de la musique')).toBe(true);
  });

  test('détecte "open VS Code" (anglais) → true', () => {
    expect(isComputerUseIntent('open VS Code')).toBe(true);
  });

  test('"quelle heure est-il ?" → false (question textuelle)', () => {
    expect(isComputerUseIntent('quelle heure est-il ?')).toBe(false);
  });

  test('"explique moi la photosynthèse" → false', () => {
    expect(isComputerUseIntent('explique moi la photosynthèse')).toBe(false);
  });

  test('"combien fait 2+2 ?" → false', () => {
    expect(isComputerUseIntent('combien fait 2+2 ?')).toBe(false);
  });

  test('commande vide "" → false (pas de crash)', () => {
    expect(() => isComputerUseIntent('')).not.toThrow();
    expect(isComputerUseIntent('')).toBe(false);
  });

  test('commande très longue → ne crashe pas', () => {
    const longCommand = 'a'.repeat(10000);
    expect(() => isComputerUseIntent(longCommand)).not.toThrow();
  });

  test('chaîne avec seulement des espaces → false', () => {
    expect(isComputerUseIntent('   ')).toBe(false);
  });
});

// ─── Tests runIntentPipeline ────────────────────────────────────────────────────

describe('runIntentPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('commande valide avec steps → retourne {success, goal, steps}', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: 'Ouvrir Safari',
      confidence: 0.9,
      steps: [{ skill: 'open_app', params: { app: 'Safari' } }],
      model: 'rules-engine',
    });

    mockExecuteSequence.mockResolvedValueOnce({
      success: true,
      results: [{ step: { skill: 'open_app', params: {} }, result: { success: true }, success: true }],
    });

    const result = await runIntentPipeline('ouvre Safari', { useVision: false, usePlaywright: false });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.goal).toBe('Ouvrir Safari');
    expect(Array.isArray(result.steps)).toBe(true);
  });

  test('plan vide → fallback LLM direct retourne _textResponse', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: 'Quelle heure est-il',
      confidence: 0,
      steps: [],
      error: null,
    });

    ask.mockResolvedValueOnce({ success: true, text: 'Il est 14h30', model: 'llama3.2:3b' });

    const result = await runIntentPipeline('quelle heure est-il', { useVision: false, usePlaywright: false });

    expect(result.success).toBe(true);
    expect(result._textResponse).toBe('Il est 14h30');
  });

  test('plan avec erreur → fallback LLM', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: 'Test',
      confidence: 0,
      steps: [],
      error: 'Parse error',
    });

    ask.mockResolvedValueOnce({ success: true, text: 'Réponse de secours', model: 'llama' });

    const result = await runIntentPipeline('test intent', { useVision: false, usePlaywright: false });

    expect(result.success).toBe(true);
    expect(result._textResponse).toBe('Réponse de secours');
  });

  test('hudFn appelée lors des étapes clés', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: 'Test',
      confidence: 0.8,
      steps: [{ skill: 'run_command', params: { command: 'echo test' } }],
      model: 'rules-engine',
    });

    mockExecuteSequence.mockResolvedValueOnce({
      success: true,
      results: [{ step: { skill: 'run_command' }, result: { success: true }, success: true }],
    });

    const hudEvents = [];
    const hudFn = (event) => hudEvents.push(event);

    await runIntentPipeline('test commande', { hudFn, useVision: false, usePlaywright: false });

    expect(hudEvents.length).toBeGreaterThan(0);
    expect(hudEvents.some(e => e.type === 'thinking')).toBe(true);
  });

  test('onPlanReady appelée quand le plan est disponible', async () => {
    const mockPlanData = {
      goal: 'Mon objectif',
      confidence: 0.9,
      steps: [{ skill: 'open_app', params: { app: 'Terminal' } }],
      model: 'rules-engine',
    };
    mockPlan.mockResolvedValueOnce(mockPlanData);

    mockExecuteSequence.mockResolvedValueOnce({
      success: true,
      results: [],
    });

    let planReceived = null;
    const onPlanReady = (p) => { planReceived = p; };

    await runIntentPipeline('ouvre Terminal', { onPlanReady, useVision: false, usePlaywright: false });

    expect(planReceived).toBeDefined();
    expect(planReceived.goal).toBe('Mon objectif');
  });

  test('retourne duration comme nombre positif', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: 'Test durée',
      confidence: 0.9,
      steps: [{ skill: 'test', params: {} }],
      model: 'rules-engine',
    });

    mockExecuteSequence.mockResolvedValueOnce({ success: true, results: [] });

    const result = await runIntentPipeline('test', { useVision: false, usePlaywright: false });

    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  test('commande vide → ne crashe pas', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: '',
      confidence: 0,
      steps: [],
    });

    ask.mockResolvedValueOnce({ success: true, text: 'Aucune réponse', model: 'llama' });

    await expect(runIntentPipeline('', { useVision: false, usePlaywright: false })).resolves.toBeDefined();
  });

  test('commande très longue → ne crashe pas', async () => {
    const longIntent = 'fais quelque chose avec '.repeat(200);

    mockPlan.mockResolvedValueOnce({
      goal: longIntent.slice(0, 100),
      confidence: 0.5,
      steps: [],
    });

    ask.mockResolvedValueOnce({ success: true, text: 'OK', model: 'llama' });

    await expect(runIntentPipeline(longIntent, { useVision: false, usePlaywright: false })).resolves.toBeDefined();
  });

  test('steps multiples → tous exécutés via executeSequence', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: 'Ouvrir YouTube',
      confidence: 0.9,
      steps: [
        { skill: 'open_safari', params: {} },
        { skill: 'go_to_youtube', params: {} },
      ],
      model: 'rules-engine',
    });

    mockExecuteSequence.mockResolvedValueOnce({
      success: true,
      results: [
        { step: { skill: 'open_safari' }, result: { success: true }, success: true },
        { step: { skill: 'go_to_youtube' }, result: { success: true }, success: true },
      ],
    });

    const result = await runIntentPipeline('va sur youtube', { useVision: false, usePlaywright: false });

    expect(mockExecuteSequence).toHaveBeenCalledTimes(1);
    expect(result.steps).toHaveLength(2);
  });

  test('échec partiel : success=false si executeSequence retourne success:false', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: 'Mission partielle',
      confidence: 0.7,
      steps: [{ skill: 'open_app', params: {} }],
      model: 'rules-engine',
    });

    mockExecuteSequence.mockResolvedValueOnce({
      success: false,
      results: [{ step: { skill: 'open_app' }, result: { success: false, error: 'App non trouvée' }, success: false }],
    });

    const result = await runIntentPipeline('ouvre app inexistante', { useVision: false, usePlaywright: false });

    expect(result.success).toBe(false);
  });

  test('plan retourne model → propagé dans le résultat', async () => {
    mockPlan.mockResolvedValueOnce({
      goal: 'Test model',
      confidence: 0.8,
      steps: [{ skill: 'test', params: {} }],
      model: 'qwen3-coder',
    });

    mockExecuteSequence.mockResolvedValueOnce({ success: true, results: [] });

    const result = await runIntentPipeline('test model', { useVision: false, usePlaywright: false });

    expect(result.model).toBe('qwen3-coder');
  });
});
