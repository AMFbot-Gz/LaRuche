/**
 * packages/runtime/src/auto_deployment.js
 * @chimera/runtime — Détection automatique de l'environnement de déploiement
 *
 * Adapté de ghost-os-ultimate/runtime/deployment/auto_deployment.js
 * pour le contexte Chimera / LaRuche.
 *
 * Détecte :
 *   - RAM et CPU de la machine hôte
 *   - Présence d'Ollama sur localhost:11434
 *   - GPU (macOS sysctl)
 *
 * Recommande :
 *   ULTIMATE  → ≥ 16 GB RAM + ≥ 8 cœurs
 *   STANDARD  → ≥  8 GB RAM + ≥ 4 cœurs
 *   LITE      → reste (ressources limitées)
 *
 * Génère .env.auto à la racine du projet Chimera.
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

// Racine du projet Chimera : remonter de packages/runtime/src/ → racine
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHIMERA_ROOT = path.resolve(__dirname, '..', '..', '..');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convertit les octets en gigaoctets.
 * @param {number} bytes
 * @returns {number}
 */
function bytesToGB(bytes) {
  return bytes / (1024 ** 3);
}

/**
 * Vérifie si Ollama répond sur localhost:11434.
 * Timeout 3 s pour ne pas bloquer le démarrage.
 * @returns {Promise<boolean>}
 */
async function checkOllama() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Tente de détecter un GPU via sysctl (macOS).
 * Sur Linux, on lirait /proc/driver/nvidia/... mais on reste minimaliste.
 * @returns {string}
 */
function detectGPU() {
  try {
    const out = execSync('sysctl -n hw.model 2>/dev/null || true', {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    if (out.toLowerCase().includes('mac')) return 'Apple Silicon / Metal';
    return 'Inconnu';
  } catch {
    return 'Inconnu';
  }
}

/**
 * Espace disque disponible sur le volume racine (en GB).
 * @returns {number}
 */
function getFreeDiskGB() {
  try {
    const raw = execSync("df -k / | tail -1 | awk '{print $4}'", {
      encoding: 'utf8',
      timeout: 2000,
    }).trim();
    return parseInt(raw, 10) / (1024 ** 2); // kB → GB
  } catch {
    return 0;
  }
}

// ─── Classe principale ────────────────────────────────────────────────────────

export class AutoDeployment {
  constructor(options = {}) {
    // Chemin de sortie du fichier .env.auto (racine Chimera)
    this.envOutputPath = options.envOutputPath
      ?? path.join(CHIMERA_ROOT, '.env.auto');
  }

  /**
   * Collecte les informations système et recommande un tier.
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
  async detect() {
    const ram_gb    = bytesToGB(os.totalmem());
    const cpu_cores = os.cpus().length;
    const free_disk_gb = getFreeDiskGB();
    const gpu       = detectGPU();
    const ollama    = await checkOllama();

    // ── Sélection du tier ────────────────────────────────────────────────────
    let tier;
    let recommendation;

    if (ram_gb >= 16 && cpu_cores >= 8) {
      tier = 'ULTIMATE';
      recommendation = 'Machine haute performance — Mode Ultime recommandé (toutes couches actives)';
    } else if (ram_gb >= 8 && cpu_cores >= 4) {
      tier = 'STANDARD';
      recommendation = 'Machine intermédiaire — Mode Standard recommandé (swarm désactivé)';
    } else {
      tier = 'LITE';
      recommendation = 'Machine légère — Mode Léger recommandé (ressources optimisées)';
    }

    const config = {
      tier,
      ram_gb:       Math.round(ram_gb * 10) / 10,
      cpu_cores,
      free_disk_gb: Math.round(free_disk_gb * 10) / 10,
      gpu,
      ollama,
      recommendation,
    };

    console.log(`[AutoDeployment] RAM: ${config.ram_gb} GB | CPU: ${cpu_cores} cœurs | GPU: ${gpu}`);
    console.log(`[AutoDeployment] Ollama: ${ollama ? 'disponible ✓' : 'absent ✗'}`);
    console.log(`[AutoDeployment] → ${recommendation}`);

    // Génère le fichier .env.auto
    this._writeEnvAuto(config);

    return config;
  }

  /**
   * Génère .env.auto à la racine de Chimera avec les variables adaptées.
   * @param {object} config
   * @private
   */
  _writeEnvAuto(config) {
    // Modèle LLM recommandé selon le tier
    const llmModel = config.tier === 'ULTIMATE'
      ? 'llama3.1:70b'
      : config.tier === 'STANDARD'
        ? 'llama3.1:8b'
        : 'llama3.2:3b';

    // Missions parallèles
    const parallelMissions = config.tier === 'ULTIMATE' ? 5
      : config.tier === 'STANDARD' ? 3
        : 1;

    // Résolution de perception (0-1)
    const perceptionRes = config.tier === 'ULTIMATE' ? '1.0'
      : config.tier === 'STANDARD' ? '0.7'
        : '0.4';

    const lines = [
      '# ============================================================',
      '# .env.auto — Généré automatiquement par @chimera/runtime',
      `# Date        : ${new Date().toISOString()}`,
      `# Tier détecté: ${config.tier}`,
      `# RAM         : ${config.ram_gb} GB`,
      `# CPU         : ${config.cpu_cores} cœurs`,
      '# NE PAS COMMITTER CE FICHIER (déjà dans .gitignore)',
      '# ============================================================',
      '',
      '# ── Tier de déploiement ─────────────────────────────────────',
      `CHIMERA_TIER=${config.tier}`,
      '',
      '# ── Ollama ──────────────────────────────────────────────────',
      `OLLAMA_AVAILABLE=${config.ollama}`,
      `OLLAMA_HOST=http://localhost:11434`,
      `OLLAMA_MODEL=${llmModel}`,
      '',
      '# ── Queen Node (LaRuche) ────────────────────────────────────',
      'QUEEN_PORT=3000',
      'QUEEN_URL=http://localhost:3000',
      `CHIMERA_SECRET=${process.env.CHIMERA_SECRET || 'pico-ruche-dev-secret'}`,
      '',
      '# ── Agents Python ───────────────────────────────────────────',
      'AGENTS_BASE_PORT=8001',
      '',
      '# ── Dashboard Next.js ───────────────────────────────────────',
      'DASHBOARD_PORT=3001',
      '',
      '# ── Missions et ressources ──────────────────────────────────',
      `PARALLEL_MISSIONS=${parallelMissions}`,
      `PERCEPTION_RESOLUTION=${perceptionRes}`,
      '',
      '# ── Modes spécifiques ───────────────────────────────────────',
      `LITE_MODE=${config.tier === 'LITE' ? 'true' : 'false'}`,
      `DISABLE_SWARM=${config.tier === 'LITE' ? 'true' : 'false'}`,
      `CONSCIOUSNESS_ENABLED=${config.tier === 'ULTIMATE' ? 'true' : 'false'}`,
      `EPISODIC_MEMORY_ENABLED=${config.tier !== 'LITE' ? 'true' : 'false'}`,
      `STRATEGIST_ENABLED=${config.tier === 'ULTIMATE' ? 'true' : 'false'}`,
      `PYTHON_MAX_WORKERS=${config.tier === 'LITE' ? '1' : config.tier === 'STANDARD' ? '4' : '8'}`,
      '',
    ];

    fs.writeFileSync(this.envOutputPath, lines.join('\n'), 'utf8');
    console.log(`[AutoDeployment] .env.auto écrit → ${this.envOutputPath}`);
  }
}

// ─── Exécution directe (npm run detect) ──────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const deployment = new AutoDeployment();
  deployment.detect()
    .then((config) => {
      console.log('\n[AutoDeployment] Configuration finale :');
      console.log(JSON.stringify(config, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[AutoDeployment] Erreur :', err.message);
      process.exit(1);
    });
}
