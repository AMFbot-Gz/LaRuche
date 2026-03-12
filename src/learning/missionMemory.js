/**
 * missionMemory.js — Mémoire auto-apprenante LaRuche v1.0
 *
 * Apprend des plans réussis pour transformer toute demande en exécution directe.
 * Plus besoin du LLM pour une commande déjà vue ou similaire.
 *
 * Stockage:
 *   data/learned_routes.json  — routes apprises (persist entre redémarrages)
 *   data/mission_log.jsonl    — journal complet de toutes les missions
 *
 * Pipeline:
 *   1. routeByRules() — règles statiques (instant)
 *   2. recall()       — mémoire apprise (instant)
 *   3. LLM planner    — fallback lent (~10-30s)
 *   4. learn()        — enregistre le résultat LLM pour la prochaine fois
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../');
const DATA_DIR = join(ROOT, 'data');
const ROUTES_FILE = join(DATA_DIR, 'learned_routes.json');
const LOG_FILE = join(DATA_DIR, 'mission_log.jsonl');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// Cache en RAM + flag dirty pour éviter écritures inutiles
let _routes = null;
let _dirty = false;

// ─── Chargement / Sauvegarde ───────────────────────────────────────────────────

function loadRoutes() {
  if (_routes) return _routes;
  try {
    if (existsSync(ROUTES_FILE)) {
      _routes = JSON.parse(readFileSync(ROUTES_FILE, 'utf8'));
      return _routes;
    }
  } catch {}
  _routes = [];
  return _routes;
}

function flushRoutes() {
  if (!_dirty) return;
  try {
    writeFileSync(ROUTES_FILE, JSON.stringify(_routes, null, 2), 'utf8');
    _dirty = false;
  } catch (e) {
    console.warn('[Memory] flush error:', e.message);
  }
}

// ─── Similarité sémantique (léger, zéro dépendance) ───────────────────────────

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/["`''""[\](){}]/g, '')
    .replace(/[àáâãä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i').replace(/[ôö]/g, 'o').replace(/[ùûü]/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();
}

// Stop-words FR/EN à ignorer dans la comparaison
const STOP = new Set(['le','la','les','un','une','des','du','de','sur','dans','avec','et','ou','par',
  'pour','the','a','an','is','on','in','at','of','to','do','be','it']);

function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter(w => w.length > 2 && !STOP.has(w));
}

function similarity(a, b) {
  const wa = new Set(tokenize(a));
  const wb = new Set(tokenize(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  const intersection = [...wa].filter(w => wb.has(w)).length;
  // Jaccard index
  return intersection / (wa.size + wb.size - intersection);
}

// ─── API publique ──────────────────────────────────────────────────────────────

/**
 * Enregistre un plan réussi (ou toute mission) dans le journal.
 * Apprend uniquement les succès qui viennent du LLM.
 *
 * @param {string} command         — commande originale
 * @param {Array}  steps           — [{skill, params, description}]
 * @param {boolean} success
 * @param {number}  duration       — ms
 * @param {string}  source         — 'rules' | 'memory' | 'llm'
 */
export function learn(command, steps, success, duration = 0, source = 'llm') {
  // Toujours logger
  try {
    appendFileSync(LOG_FILE, JSON.stringify({
      ts: new Date().toISOString(),
      command: (command || '').slice(0, 200),
      steps: (steps || []).slice(0, 6),
      success,
      duration,
      source,
    }) + '\n', 'utf8');
  } catch {}

  // N'apprend que les plans LLM réussis avec au moins 1 step valide
  if (!success || source !== 'llm' || !Array.isArray(steps) || steps.length === 0) return;

  const routes = loadRoutes();
  const norm = normalize(command);

  // Cherche une route très similaire (≥90%)
  const existing = routes.find(r => similarity(r.normalizedCommand, command) >= 0.90);

  if (existing) {
    existing.hits = (existing.hits || 0) + 1;
    existing.totalSuccess = (existing.totalSuccess || 0) + 1;
    existing.lastUsed = new Date().toISOString();
    // Rafraîchit le plan avec la version la plus récente
    existing.steps = steps;
  } else {
    routes.push({
      normalizedCommand: norm,
      originalCommand: command,
      steps,
      hits: 1,
      totalSuccess: 1,
      avgDuration: duration,
      learnedAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    });

    // Limite à 1000 routes, garde les plus utilisées
    if (routes.length > 1000) {
      routes.sort((a, b) => (b.hits || 0) - (a.hits || 0));
      routes.splice(1000);
    }
  }

  _dirty = true;
  flushRoutes();
}

/**
 * Cherche une route apprise correspondant à la commande.
 *
 * @param {string} command
 * @param {number} threshold  — score Jaccard minimum (défaut 0.72)
 * @returns {{ steps, confidence, source: 'memory', originalCommand } | null}
 */
export function recall(command, threshold = 0.72) {
  const routes = loadRoutes();
  if (routes.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const route of routes) {
    const score = similarity(command, route.normalizedCommand || route.originalCommand || '');
    if (score > bestScore) {
      bestScore = score;
      best = route;
    }
  }

  if (!best || bestScore < threshold) return null;

  // Met à jour les hits
  best.hits = (best.hits || 0) + 1;
  best.lastUsed = new Date().toISOString();
  _dirty = true;
  // Flush différé (pas bloquant)
  setImmediate(flushRoutes);

  return {
    steps: best.steps,
    confidence: bestScore,
    source: 'memory',
    originalCommand: best.originalCommand,
  };
}

/**
 * Statistiques de la mémoire — pour /api/memory
 */
export function memoryStats() {
  const routes = loadRoutes();
  const sorted = [...routes].sort((a, b) => (b.hits || 0) - (a.hits || 0));
  return {
    totalRoutes: routes.length,
    topRoutes: sorted.slice(0, 10).map(r => ({
      command: (r.originalCommand || '').slice(0, 60),
      hits: r.hits || 0,
      skills: (r.steps || []).map(s => s.skill).join(' → '),
    })),
  };
}

/**
 * Supprime une route (pour les corrections manuelles)
 */
export function forget(command) {
  const routes = loadRoutes();
  const idx = routes.findIndex(r => similarity(r.normalizedCommand || '', command) >= 0.90);
  if (idx === -1) return false;
  routes.splice(idx, 1);
  _dirty = true;
  flushRoutes();
  return true;
}
