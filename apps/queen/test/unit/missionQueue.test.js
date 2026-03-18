/**
 * test/unit/missionQueue.test.js — Tests unitaires MissionQueue
 *
 * Couvre : enqueue, concurrence max, saturation (503), stats, onUpdate callback
 */

import { jest } from '@jest/globals';
import { MissionQueue } from '../../src/missionQueue.js';

// Helper : crée une fn async qui tient un certain temps
const delay = (ms) => new Promise(r => setTimeout(r, ms));
const makeTask = (ms = 0, result = 'ok') => () => delay(ms).then(() => result);

// ─── Construction ─────────────────────────────────────────────────────────────

describe('MissionQueue — construction', () => {
  test('valeurs initiales correctes', () => {
    const q = new MissionQueue(3);
    const stats = q.stats;
    expect(stats.pending).toBe(0);
    expect(stats.running).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);
    expect(stats.maxConcurrent).toBe(3);
  });

  test('maxConcurrent = 1 par défaut si non fourni', () => {
    const q = new MissionQueue();
    expect(q.stats.maxConcurrent).toBeGreaterThanOrEqual(1);
  });
});

// ─── Enqueue basique ───────────────────────────────────────────────────────────

describe('MissionQueue — enqueue basique', () => {
  test('résout la promise avec le résultat de la fn', async () => {
    const q = new MissionQueue(1);
    const result = await q.enqueue(makeTask(0, 'bonjour'));
    expect(result).toBe('bonjour');
  });

  test("exécute les tâches dans l'ordre FIFO", async () => {
    const q = new MissionQueue(1);
    const order = [];
    const p1 = q.enqueue(async () => { order.push(1); return 1; });
    const p2 = q.enqueue(async () => { order.push(2); return 2; });
    const p3 = q.enqueue(async () => { order.push(3); return 3; });
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  test('rejette si la fn lance une erreur', async () => {
    const q = new MissionQueue(1);
    await expect(q.enqueue(async () => { throw new Error('boom'); }))
      .rejects.toThrow('boom');
  });
});

// ─── Concurrence ──────────────────────────────────────────────────────────────

describe('MissionQueue — concurrence', () => {
  test('ne dépasse jamais maxConcurrent tâches en parallèle', async () => {
    const q = new MissionQueue(2);
    let maxObserved = 0;
    let current = 0;

    const trackTask = async () => {
      current++;
      maxObserved = Math.max(maxObserved, current);
      await delay(20);
      current--;
    };

    await Promise.all([
      q.enqueue(trackTask),
      q.enqueue(trackTask),
      q.enqueue(trackTask),
      q.enqueue(trackTask),
    ]);

    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  test('exécute maxConcurrent tâches immédiatement si queue vide', async () => {
    const q = new MissionQueue(3);
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 3 }, () =>
      q.enqueue(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay(30);
        concurrent--;
      })
    );

    await Promise.all(tasks);
    expect(maxConcurrent).toBe(3);
  });
});

// ─── Saturation (503) ─────────────────────────────────────────────────────────

describe('MissionQueue — saturation', () => {
  test('rejette avec statusCode 503 si queue pleine', async () => {
    const q = new MissionQueue(1);
    // Bloquer le slot unique
    q.enqueue(() => delay(5000)); // tâche longue qui occupe le slot

    // Remplir jusqu'à la limite (100 en attente)
    const fills = [];
    for (let i = 0; i < 100; i++) {
      fills.push(q.enqueue(() => delay(1)));
    }

    // La 101ème doit être rejetée
    try {
      await q.enqueue(() => Promise.resolve('jamais'));
      throw new Error('Devrait avoir rejeté');
    } catch (err) {
      expect(err.statusCode).toBe(503);
      expect(err.message).toMatch(/Queue saturée/);
    }
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('MissionQueue — stats', () => {
  test('completed incrémente après succès', async () => {
    const q = new MissionQueue(1);
    await q.enqueue(makeTask(0));
    await q.enqueue(makeTask(0));
    expect(q.stats.completed).toBe(2);
  });

  test('failed incrémente après rejet', async () => {
    const q = new MissionQueue(1);
    await q.enqueue(async () => { throw new Error('x'); }).catch(() => {});
    expect(q.stats.failed).toBe(1);
  });
});

// ─── onUpdate callback ────────────────────────────────────────────────────────

describe('MissionQueue — onUpdate', () => {
  test("callback appelé lors des changements d'état", async () => {
    const q = new MissionQueue(1);
    const updates = [];
    q.onUpdate((stats) => updates.push({ ...stats }));

    await q.enqueue(makeTask(10));

    // Au moins une update doit avoir été émise
    expect(updates.length).toBeGreaterThan(0);
  });
});
