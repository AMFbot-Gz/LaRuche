/**
 * packages/runtime/src/index.js
 * @chimera/runtime — Point d'entrée public
 *
 * Exporte les trois classes de déploiement et une fonction utilitaire
 * qui détecte automatiquement le tier et configure l'environnement.
 */

export { AutoDeployment } from './auto_deployment.js';
export { LiteMode }       from './lite_mode.js';
export { UltimateMode }   from './ultimate_mode.js';

/**
 * Détecte les ressources de la machine et configure automatiquement
 * le tier de déploiement Chimera.
 *
 * Usage :
 *   import { detectAndConfigure } from '@chimera/runtime';
 *   const config = await detectAndConfigure();
 *   // → { tier: 'ULTIMATE', ram_gb: 32, cpu_cores: 10, ... }
 *
 * @param {object} [options] - Options passées à AutoDeployment
 * @returns {Promise<{
 *   tier: 'ULTIMATE'|'STANDARD'|'LITE',
 *   ram_gb: number,
 *   cpu_cores: number,
 *   ollama: boolean,
 *   gpu: string,
 *   free_disk_gb: number,
 *   recommendation: string,
 * }>}
 */
export async function detectAndConfigure(options = {}) {
  const { AutoDeployment } = await import('./auto_deployment.js');
  const deployment = new AutoDeployment(options);
  const config = await deployment.detect();
  console.log(`[Runtime] Mode détecté: ${config.tier}`);
  return config;
}
