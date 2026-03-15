/**
 * test/unit/circuitBreaker.test.js — Tests unitaires Circuit Breaker
 */

import { CircuitBreaker, CircuitState, CircuitOpenError } from '../../src/utils/circuitBreaker.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const succeed  = () => Promise.resolve('ok');
const fail     = () => Promise.reject(new Error('service down'));
const delay    = ms => new Promise(r => setTimeout(r, ms));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  // ── État CLOSED ─────────────────────────────────────────────────────────────

  describe('état CLOSED (nominal)', () => {
    test('laisse passer les appels en succès', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3 });
      const result = await cb.call(succeed);
      expect(result).toBe('ok');
      expect(cb.getState().state).toBe(CircuitState.CLOSED);
    });

    test('compte les échecs mais reste CLOSED sous le seuil', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3 });
      try { await cb.call(fail); } catch {}
      try { await cb.call(fail); } catch {}
      expect(cb.getState().state).toBe(CircuitState.CLOSED);
      expect(cb.getState().failures).toBe(2);
    });

    test('reset le compteur d\'échecs après un succès', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3 });
      try { await cb.call(fail); } catch {}
      await cb.call(succeed);
      expect(cb.getState().failures).toBe(0);
    });
  });

  // ── Transition CLOSED → OPEN ─────────────────────────────────────────────────

  describe('ouverture du circuit', () => {
    test('ouvre le circuit après failureThreshold échecs', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 3 });
      for (let i = 0; i < 3; i++) {
        try { await cb.call(fail); } catch {}
      }
      expect(cb.getState().state).toBe(CircuitState.OPEN);
    });

    test('rejette instantanément quand OPEN', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 99999 });
      try { await cb.call(fail); } catch {}
      try { await cb.call(fail); } catch {}

      const t0 = Date.now();
      await expect(cb.call(succeed)).rejects.toThrow(CircuitOpenError);
      expect(Date.now() - t0).toBeLessThan(50); // << 5000ms timeout réel — quasi-instant
    });

    test('CircuitOpenError contient le nom du service', async () => {
      const cb = new CircuitBreaker('Brain:8003', { failureThreshold: 1 });
      try { await cb.call(fail); } catch {}
      try {
        await cb.call(succeed);
      } catch (err) {
        expect(err).toBeInstanceOf(CircuitOpenError);
        expect(err.serviceName).toBe('Brain:8003');
      }
    });
  });

  // ── Récupération OPEN → HALF_OPEN → CLOSED ──────────────────────────────────

  describe('récupération automatique', () => {
    test('passe en HALF_OPEN après resetTimeout', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 1, resetTimeoutMs: 30 });
      try { await cb.call(fail); } catch {}
      expect(cb.getState().state).toBe(CircuitState.OPEN);

      await delay(40); // attendre resetTimeout

      // Le prochain appel doit transitionner en HALF_OPEN et exécuter fn
      let called = false;
      try {
        await cb.call(() => { called = true; return Promise.reject(new Error('still down')); });
      } catch {}
      expect(called).toBe(true);
    });

    test('referme le circuit après succès depuis HALF_OPEN', async () => {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 20,
      });
      try { await cb.call(fail); } catch {}
      await delay(30);

      await cb.call(succeed); // probe réussi
      expect(cb.getState().state).toBe(CircuitState.CLOSED);
    });

    test('reouvre si le probe HALF_OPEN échoue', async () => {
      const cb = new CircuitBreaker('test', {
        failureThreshold: 1,
        resetTimeoutMs: 20,
      });
      try { await cb.call(fail); } catch {}
      await delay(30);

      try { await cb.call(fail); } catch {} // probe échoue
      expect(cb.getState().state).toBe(CircuitState.OPEN);
    });
  });

  // ── Reset manuel ──────────────────────────────────────────────────────────────

  describe('reset manuel', () => {
    test('reset() referme immédiatement un circuit ouvert', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 1 });
      try { await cb.call(fail); } catch {}
      expect(cb.getState().state).toBe(CircuitState.OPEN);

      cb.reset();
      expect(cb.getState().state).toBe(CircuitState.CLOSED);

      const result = await cb.call(succeed);
      expect(result).toBe('ok');
    });
  });

  // ── Statistiques ──────────────────────────────────────────────────────────────

  describe('statistiques', () => {
    test('compte total / success / failure / rejected', async () => {
      const cb = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 99999 });

      await cb.call(succeed);
      try { await cb.call(fail); } catch {}
      try { await cb.call(fail); } catch {}  // ouvre le circuit
      try { await cb.call(succeed); } catch {} // rejeté

      const stats = cb.getState().stats;
      expect(stats.total).toBe(4);
      expect(stats.success).toBe(1);
      expect(stats.failure).toBe(2);
      expect(stats.rejected).toBe(1);
    });
  });

  // ── Événements ───────────────────────────────────────────────────────────────

  describe('événements eventBus', () => {
    test('émet circuit.open quand le circuit s\'ouvre', async () => {
      const events = [];
      const mockBus = { emit: (ev, data) => events.push({ ev, data }) };
      const cb = new CircuitBreaker('test', { failureThreshold: 2, eventBus: mockBus });

      try { await cb.call(fail); } catch {}
      try { await cb.call(fail); } catch {}

      expect(events.some(e => e.ev === 'circuit.open')).toBe(true);
    });

    test('émet circuit.closed quand le circuit se referme', async () => {
      const events = [];
      const mockBus = { emit: (ev, data) => events.push({ ev, data }) };
      const cb = new CircuitBreaker('test', {
        failureThreshold: 1,
        successThreshold: 1,
        resetTimeoutMs: 10,
        eventBus: mockBus,
      });

      try { await cb.call(fail); } catch {}
      await delay(20);
      await cb.call(succeed);

      expect(events.some(e => e.ev === 'circuit.closed')).toBe(true);
    });
  });
});
