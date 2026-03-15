/**
 * firstRun.js — Détection et wizard premier démarrage Chimera
 *
 * Détecte si c'est le premier lancement via un flag .laruche/.initialized.
 * Affiche une bannière ASCII, vérifie les prérequis et marque comme initialisé.
 */

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// ROOT = apps/queen/ (deux niveaux au-dessus de src/utils/)
const ROOT = join(__dirname, '../../');
const LARUCHE_DIR = join(ROOT, '.laruche');
const INITIALIZED_FLAG = join(LARUCHE_DIR, '.initialized');

/**
 * Retourne true si c'est le premier démarrage (flag absent).
 * @returns {boolean}
 */
export function isFirstRun() {
  return !existsSync(INITIALIZED_FLAG);
}

/**
 * Crée le répertoire .laruche et pose le flag d'initialisation avec la date.
 */
export function markInitialized() {
  mkdirSync(LARUCHE_DIR, { recursive: true });
  writeFileSync(INITIALIZED_FLAG, new Date().toISOString());
}

/**
 * Affiche la bannière ASCII Chimera et les premières choses à faire.
 */
export function printWelcomeBanner() {
  const banner = `
\x1b[36m\x1b[1m
  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║    ██████╗██╗  ██╗██╗███╗   ███╗███████╗██████╗  █████╗    ║
  ║   ██╔════╝██║  ██║██║████╗ ████║██╔════╝██╔══██╗██╔══██╗   ║
  ║   ██║     ███████║██║██╔████╔██║█████╗  ██████╔╝███████║   ║
  ║   ██║     ██╔══██║██║██║╚██╔╝██║██╔══╝  ██╔══██╗██╔══██║   ║
  ║   ╚██████╗██║  ██║██║██║ ╚═╝ ██║███████╗██║  ██║██║  ██║   ║
  ║    ╚═════╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ║
  ║                                                              ║
  ║         🐝  Local-first Autonomous AI OS  🐝                  ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝
\x1b[0m`;

  console.log(banner);
  console.log('\x1b[1m\x1b[32m  Bienvenue dans Chimera ! Premier démarrage détecté.\x1b[0m\n');
  console.log('\x1b[1m  Les 3 premières choses à faire :\x1b[0m');
  console.log('');
  console.log('  \x1b[33m1.\x1b[0m Vérifiez votre configuration :');
  console.log('     \x1b[36mcurl http://localhost:3000/api/doctor\x1b[0m');
  console.log('');
  console.log('  \x1b[33m2.\x1b[0m Lancez une mission de test :');
  console.log("     \x1b[36mcurl -X POST http://localhost:3000/api/mission \\\x1b[0m");
  console.log("     \x1b[36m  -H 'Content-Type: application/json' \\\x1b[0m");
  console.log(`     \x1b[36m  -d '{"command":"prends un screenshot de l\\'écran"}'\x1b[0m`);
  console.log('');
  console.log('  \x1b[33m3.\x1b[0m Ouvrez le dashboard :');
  console.log('     \x1b[36mhttp://localhost:3001\x1b[0m');
  console.log('');
}

/**
 * Effectue les vérifications de premier démarrage :
 * - Ollama disponible
 * - .env présent
 * - Au moins un modèle Ollama disponible
 *
 * @returns {Promise<{ ok: boolean, issues: string[] }>}
 */
export async function runFirstRunChecks() {
  const issues = [];

  // ── Vérification .env ────────────────────────────────────────────────────────
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) {
    issues.push('.env manquant — copiez .env.example vers .env et configurez vos secrets');
  }

  // ── Vérification Ollama disponible ───────────────────────────────────────────
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  let ollamaModels = [];
  try {
    const r = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (r.ok) {
      const data = await r.json();
      ollamaModels = data.models || [];
    } else {
      issues.push(`Ollama répond avec HTTP ${r.status} — vérifiez que ollama serve est lancé`);
    }
  } catch (e) {
    issues.push(`Ollama inaccessible (${ollamaHost}) — lancez : ollama serve`);
  }

  // ── Vérification qu'au moins un modèle est disponible ───────────────────────
  if (ollamaModels.length === 0 && !issues.some(i => i.includes('Ollama'))) {
    issues.push('Aucun modèle Ollama disponible — lancez : ollama pull llama3.2:3b');
  } else if (ollamaModels.length > 0) {
    // Vérifie le modèle par défaut configuré
    const defaultModel = process.env.OLLAMA_MODEL_DEFAULT || 'llama3.2:3b';
    const modelNames = ollamaModels.map(m => m.name || '');
    const hasDefault = modelNames.some(n => n.startsWith(defaultModel.split(':')[0]));
    if (!hasDefault) {
      issues.push(
        `Modèle par défaut "${defaultModel}" absent — lancez : ollama pull ${defaultModel}`
      );
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
