/**
 * test/unit/computerUseLoop.test.js — Tests unitaires ComputerUseLoop (services/)
 *
 * Couvre : démarrage session, annulation, session déjà active (throw),
 *          getActiveSessions, événements EventEmitter
 *
 * Stratégie : mock fetch global — pas d'appel réseau réel
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Réponse screenshot par défaut
const screenshotOk = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ screenshot_b64: 'fake_base64_screenshot' }),
});

// Réponse vision par défaut : goal atteint immédiatement
const visionGoalAchieved = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({
    goal_achieved: true,
    ui_state: 'Desktop visible',
    next_action: null,
    clickable_elements: [],
  }),
});

// Réponse vision : continue (goal non atteint)
const visionContinue = (action = { type: 'wait' }) => () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({
    goal_achieved: false,
    ui_state: 'Loading...',
    next_action: action,
    clickable_elements: [],
  }),
});

// Réponse executor par défaut
const executorOk = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ success: true }),
});

import { ComputerUseLoop } from '../../src/services/computer_use_loop.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLoop() {
  // hitlManager minimal (approuve toujours sans attendre)
  const hitlManager = {
    request: jest.fn(() => Promise.resolve({ approved: true })),
  };
  const eventBus = new EventEmitter();
  return new ComputerUseLoop({ eventBus, hitlManager });
}

// ─── start — cas basiques ─────────────────────────────────────────────────────

describe('ComputerUseLoop — start()',  () => {
  beforeEach(() => mockFetch.mockReset());

  test('démarre une session et résout en succès quand goal_achieved=true',  async () => {
    mockFetch
      .mockImplementationOnce(screenshotOk)    // screenshot
      .mockImplementationOnce(visionGoalAchieved); // vision → goal atteint

    const loop = makeLoop();
    const result = await loop.start('session-1', 'Ouvre Safari');

    expect(result.success).toBe(true);
    expect(result.steps).toBeGreaterThanOrEqual(1);
  });

  test('lance une erreur si session déjà active',  async () => {
    mockFetch.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 200)); // session qui dure
      return { ok: true, json: () => Promise.resolve({ screenshot_b64: 'x' }) };
    });

    const loop = makeLoop();
    // Lance en background sans await
    const p1 = loop.start('dup-session', 'mission 1').catch(() => {});

    // Tenter de démarrer la même session immédiatement
    await expect(loop.start('dup-session', 'mission 2'))
      .rejects.toThrow(/déjà active/);

    await p1; // cleanup
  });

  test('retourne failure si screenshot échoue sur toutes les itérations',  async () => {
    // screenshot échoue à chaque appel
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED :8002'));

    const loop = makeLoop();
    const result = await loop.start('fail-ss', 'mission avec screenshot KO', { maxIterations: 2 });

    expect(result.success).toBe(false);
  });
});

// ─── cancel() ─────────────────────────────────────────────────────────────────

describe('ComputerUseLoop — cancel()',  () => {
  beforeEach(() => mockFetch.mockReset());

  test('annule une session en cours et retourne success:false',  async () => {
    // screenshot bloquant (200ms par appel) → donne le temps d'annuler
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      await new Promise(r => setTimeout(r, 50));
      return {
        ok: true,
        json: () => Promise.resolve(
          callCount % 2 === 1
            ? { screenshot_b64: 'fake' }
            : { goal_achieved: false, ui_state: 'still running', next_action: { type: 'wait' } }
        ),
      };
    });

    const loop = makeLoop();
    const p = loop.start('cancel-me', 'mission longue', { maxIterations: 20 });

    // Annuler après 80ms
    await new Promise(r => setTimeout(r, 80));
    loop.cancel('cancel-me');

    const result = await p;
    expect(result.success).toBe(false);
    expect(result.reason).toBe('cancelled');
  });

  test(`cancel sur une session inexistante ne lance pas d'erreur`,  () => {
    const loop = makeLoop();
    expect(() => loop.cancel('inexistant')).not.toThrow();
  });
});

// ─── getActiveSessions() ──────────────────────────────────────────────────────

describe('ComputerUseLoop — getActiveSessions()',  () => {
  beforeEach(() => mockFetch.mockReset());

  test('retourne un tableau vide avant toute session',  () => {
    const loop = makeLoop();
    expect(loop.getActiveSessions()).toEqual([]);
  });

  test(`liste la session pendant qu'elle tourne`,  async () => {
    // Screenshot lent mais débloquable par cancel
    mockFetch.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 50));
      return { ok: true, json: () => Promise.resolve({ screenshot_b64: 'x' }) };
    });

    const loop = makeLoop();
    const p = loop.start('active-1', 'mission active', { maxIterations: 10 }).catch(() => {});

    // Laisser le démarrage s'enregistrer
    await new Promise(r => setTimeout(r, 5));

    const sessions = loop.getActiveSessions();
    expect(sessions.some(s => s.id === 'active-1')).toBe(true);

    loop.cancel('active-1');
    await p;
  }, 3000);
});

// ─── Événements EventEmitter ──────────────────────────────────────────────────

describe('ComputerUseLoop — événements',  () => {
  beforeEach(() => mockFetch.mockReset());

  test('émet "step" à chaque itération',  async () => {
    mockFetch
      .mockImplementationOnce(screenshotOk)
      .mockImplementationOnce(visionGoalAchieved);

    const loop = makeLoop();
    const steps = [];
    loop.on('step', (data) => steps.push(data));

    await loop.start('ev-1', 'test events');

    expect(steps.length).toBeGreaterThanOrEqual(1);
    expect(steps[0]).toMatchObject({ sessionId: 'ev-1' });
  });

  test('émet "session.started" au démarrage',  async () => {
    mockFetch
      .mockImplementationOnce(screenshotOk)
      .mockImplementationOnce(visionGoalAchieved);

    const loop = makeLoop();
    const started = [];
    loop.on('session.started', (d) => started.push(d));

    await loop.start('ev-start', 'test start event');

    expect(started.length).toBe(1);
    expect(started[0].sessionId).toBe('ev-start');
  });

  test('émet "session.ended" à la fin',  async () => {
    mockFetch
      .mockImplementationOnce(screenshotOk)
      .mockImplementationOnce(visionGoalAchieved);

    const loop = makeLoop();
    const ended = [];
    loop.on('session.ended', (d) => ended.push(d));

    await loop.start('ev-end', 'test end event');

    expect(ended.length).toBe(1);
    expect(ended[0].success).toBe(true);
  });
});
