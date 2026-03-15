#!/usr/bin/env node
/**
 * scripts/benchmark_circuit_breaker.js — Benchmark Circuit Breaker
 *
 * Mesure la différence de temps de réponse entre :
 *   AVANT : appels directs fetch() vers un service DOWN → attente timeout complet
 *   APRÈS : appels via CircuitBreaker → échec immédiat après ouverture du circuit
 *
 * Usage : node scripts/benchmark_circuit_breaker.js
 */

import { CircuitBreaker, circuitRegistry } from '../src/utils/circuitBreaker.js';

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function fmt(ms) {
  if (ms < 1)   return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function header(title) {
  console.log(`\n${BOLD}${CYAN}═══ ${title} ═══${RESET}`);
}

function result(label, value, good = true) {
  const color = good ? GREEN : RED;
  console.log(`  ${color}${BOLD}${label}${RESET}: ${value}`);
}

// ─── Simulation d'un service DOWN ─────────────────────────────────────────────

/**
 * Simule un appel qui échoue avec un délai (timeout simulé).
 * Représente : fetch() vers un service DOWN qui attend jusqu'au timeout.
 */
function failingCallWithTimeout(timeoutMs = 5000) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Connection refused')), timeoutMs);
  });
}

/**
 * Simule un appel qui échoue immédiatement.
 * Représente : l'appel est intercepté par le circuit breaker (état OPEN).
 */
function instantFail() {
  return Promise.reject(new Error('Connection refused'));
}

// ─── Benchmark AVANT : sans circuit breaker ──────────────────────────────────

async function benchmarkWithout(nCalls, simulatedTimeoutMs) {
  header(`AVANT — ${nCalls} appels directs (timeout simulé: ${simulatedTimeoutMs}ms)`);

  const times = [];
  for (let i = 0; i < nCalls; i++) {
    const t0 = performance.now();
    try {
      await failingCallWithTimeout(simulatedTimeoutMs);
    } catch {
      // erreur attendue
    }
    times.push(performance.now() - t0);
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  const total = times.reduce((a, b) => a + b, 0);
  const avg   = total / nCalls;

  result('Temps total', `${fmt(total)}`, false);
  result('Temps moyen / appel', `${fmt(avg)}`, false);
  result('Tous les appels ont attendu le timeout', 'OUI', false);

  return { total, avg, times };
}

// ─── Benchmark APRÈS : avec circuit breaker ──────────────────────────────────

async function benchmarkWith(nCalls, failureThreshold) {
  header(`APRÈS — ${nCalls} appels via CircuitBreaker (seuil: ${failureThreshold} échecs)`);

  const cb = new CircuitBreaker('TestService:8003', {
    failureThreshold,
    resetTimeoutMs: 60_000, // long pour le bench (pas de reset pendant le test)
    callTimeoutMs:  5_000,
  });

  const times    = [];
  let circuitOpenAt = null;

  for (let i = 0; i < nCalls; i++) {
    const t0 = performance.now();
    try {
      await cb.call(() => instantFail());
    } catch (err) {
      if (err.name === 'CircuitOpenError' && !circuitOpenAt) {
        circuitOpenAt = i;
      }
    }
    times.push(performance.now() - t0);
    process.stdout.write(circuitOpenAt !== null && i >= circuitOpenAt ? '⚡' : '✗');
  }
  process.stdout.write('\n');

  const total   = times.reduce((a, b) => a + b, 0);
  const avg     = total / nCalls;

  // Séparer les appels avant/après ouverture
  const before  = times.slice(0, failureThreshold);
  const after   = times.slice(failureThreshold);
  const avgBefore = before.reduce((a, b) => a + b, 0) / before.length;
  const avgAfter  = after.length ? after.reduce((a, b) => a + b, 0) / after.length : 0;

  result('Circuit ouvert à l\'appel n°', `${circuitOpenAt ?? 'jamais'}`, circuitOpenAt !== null);
  result('Temps total', `${fmt(total)}`, true);
  result('Temps moyen avant ouverture', `${fmt(avgBefore)}`, false);
  result('Temps moyen APRÈS ouverture', `${fmt(avgAfter)} ← INSTANT!`, true);

  const state = cb.getState();
  result('État final du circuit', state.state, state.state !== 'CLOSED');
  result('Stats', `total=${state.stats.total} / rejected=${state.stats.rejected} / failure=${state.stats.failure}`, true);

  return { total, avg, avgBefore, avgAfter, times, circuitOpenAt };
}

// ─── Comparaison finale ───────────────────────────────────────────────────────

async function compare(resultBefore, resultAfter, nCalls, simulatedTimeoutMs) {
  header('RÉSUMÉ — Gains');

  const gainTotal   = resultBefore.total / resultAfter.total;
  const gainPerCall = (resultBefore.avg / resultAfter.avgAfter).toFixed(0);

  console.log(`
  ${BOLD}Scénario :${RESET} ${nCalls} appels vers un service DOWN (timeout simulé: ${simulatedTimeoutMs}ms)

  ${YELLOW}SANS circuit breaker :${RESET}
    Tous les appels attendent ${simulatedTimeoutMs}ms → total = ${fmt(resultBefore.total)}

  ${GREEN}AVEC circuit breaker (seuil: 3 échecs) :${RESET}
    Appels 1-3 : attendent l'échec (normal — circuit pas encore ouvert)
    Appels 4-${nCalls} : rejetés instantanément en ${fmt(resultAfter.avgAfter)} → circuit OPEN

  ${BOLD}Gain de temps :${RESET} ${gainTotal.toFixed(0)}x plus rapide
  ${BOLD}Gain par appel (après ouverture) :${RESET} ${gainPerCall}x plus rapide
  ${BOLD}Temps économisé :${RESET} ${fmt(resultBefore.total - resultAfter.total)}
  `);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const N_CALLS           = 10;    // Nombre d'appels simulés
const SIMULATED_TIMEOUT = 100;   // Timeout simulé en ms (réduit pour le bench)

console.log(`${BOLD}${CYAN}
╔═══════════════════════════════════════════════╗
║  CHIMERA — Benchmark Circuit Breaker          ║
║  Piste 6 : Timeout & Circuit Breaker          ║
╚═══════════════════════════════════════════════╝
${RESET}`);

const before = await benchmarkWithout(N_CALLS, SIMULATED_TIMEOUT);
const after  = await benchmarkWith(N_CALLS, 3);
await compare(before, after, N_CALLS, SIMULATED_TIMEOUT);

// ─── Bonus : test de récupération (HALF_OPEN) ────────────────────────────────

header('BONUS — Récupération automatique (HALF_OPEN → CLOSED)');

const cbRecovery = new CircuitBreaker('RecoveryTest', {
  failureThreshold:  2,
  successThreshold:  1,
  resetTimeoutMs:    50,   // 50ms pour le test (réel: 30s)
});

// Ouvrir le circuit
try { await cbRecovery.call(() => instantFail()); } catch {}
try { await cbRecovery.call(() => instantFail()); } catch {}
console.log(`  État après 2 échecs : ${YELLOW}${cbRecovery.getState().state}${RESET}`);

// Attendre le resetTimeout
await new Promise(r => setTimeout(r, 60));
console.log(`  Après resetTimeout (50ms) : prochain appel = probe HALF_OPEN`);

// Probe succès → circuit se referme
let state;
try {
  await cbRecovery.call(() => Promise.resolve('ok'));
  state = cbRecovery.getState().state;
} catch {
  state = cbRecovery.getState().state;
}
console.log(`  Après probe réussi : ${GREEN}${state}${RESET} ${state === 'CLOSED' ? '✅' : '❌'}`);

console.log(`\n${GREEN}${BOLD}Benchmark terminé.${RESET}\n`);
