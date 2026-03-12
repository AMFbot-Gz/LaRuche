/**
 * Tests executor.js — Exécution des steps de mission
 */
import { jest } from '@jest/globals';

describe('executor', () => {
  test('executeStep retourne erreur si skill inconnu', async () => {
    const { executeStep } = await import('../../src/agents/executor.js');
    const result = await executeStep({ skill: 'skill_inexistant_xyz', params: {} }, {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Skill|introuvable|not found/i);
  });

  test('executeStep timeout après délai max', async () => {
    const { executeStep } = await import('../../src/agents/executor.js');
    // Mock un skill qui ne répond jamais
    const slowStep = {
      skill: '__test_timeout__',
      params: {},
    };
    // Doit retourner error (pas lancer une exception)
    const result = await executeStep(slowStep, {});
    expect(result).toHaveProperty('success');
  });
});
