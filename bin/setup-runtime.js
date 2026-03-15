#!/usr/bin/env node
/**
 * bin/setup-runtime.js
 * Script de premier démarrage — Chimera / LaRuche
 *
 * Lance la détection automatique de l'environnement et génère .env.auto
 * à la racine du projet.  À appeler une fois avant `pnpm dev` ou via
 * le hook "predev" dans le package.json racine.
 *
 * Usage :
 *   node bin/setup-runtime.js
 *   node bin/setup-runtime.js --force   # recalcule même si .env.auto existe
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const CHIMERA_ROOT = path.resolve(__dirname, '..');
const ENV_AUTO     = path.join(CHIMERA_ROOT, '.env.auto');

// ── Vérification "déjà configuré" ─────────────────────────────────────────────
const force = process.argv.includes('--force');

if (!force && fs.existsSync(ENV_AUTO)) {
  console.log('[setup-runtime] .env.auto déjà présent. Utilisez --force pour reconfigurer.');
  process.exit(0);
}

// ── Détection ─────────────────────────────────────────────────────────────────
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║        Chimera — Détection de l\'environnement        ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log();

try {
  // Import dynamique pour supporter l'exécution avant que pnpm install soit terminé
  const { AutoDeployment } = await import('../packages/runtime/src/auto_deployment.js');

  const deployment = new AutoDeployment({ envOutputPath: ENV_AUTO });
  const config     = await deployment.detect();

  console.log();
  console.log('┌──────────────────────────────────────────────────────┐');
  console.log(`│  Tier recommandé : ${config.tier.padEnd(34)}│`);
  console.log(`│  RAM             : ${String(config.ram_gb + ' GB').padEnd(34)}│`);
  console.log(`│  CPU             : ${String(config.cpu_cores + ' cœurs').padEnd(34)}│`);
  console.log(`│  Ollama          : ${(config.ollama ? 'disponible ✓' : 'absent ✗').padEnd(34)}│`);
  console.log(`│  GPU             : ${String(config.gpu).slice(0, 34).padEnd(34)}│`);
  console.log('└──────────────────────────────────────────────────────┘');
  console.log();
  console.log(`[setup-runtime] .env.auto généré dans : ${ENV_AUTO}`);
  console.log('[setup-runtime] Vous pouvez lancer : pnpm dev');

  // Sortie non-zéro seulement si Ollama est requis et absent
  if (!config.ollama) {
    console.warn('\n[setup-runtime] Avertissement : Ollama n\'est pas détecté sur localhost:11434.');
    console.warn('  → Installez Ollama (https://ollama.ai) pour les fonctionnalités LLM locales.');
  }

  process.exit(0);
} catch (err) {
  console.error('[setup-runtime] Erreur lors de la détection :', err.message);
  if (process.env.LOG_LEVEL === 'debug') console.error(err.stack);
  process.exit(1);
}
