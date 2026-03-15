/**
 * packages/runtime/src/lite_mode.js
 * @chimera/runtime — Mode Léger (edge / ressources limitées)
 *
 * Adapté de ghost-os-ultimate/runtime/modes/lite_mode.js
 * pour le contexte Chimera / LaRuche.
 *
 * Objectif : faire tourner Chimera sur une machine modeste
 * (Raspberry Pi, VPS 2 Go, laptop d'entrée de gamme…).
 *
 * Désactive : swarm multi-nœuds, perception audio, planification
 *             hiérarchique complète, mémoire épisodique avancée.
 * Garde     : conscience basique, perception visuelle, planification
 *             simple, mémoire court-terme, HITL Telegram.
 */

export class LiteMode {
  constructor(options = {}) {
    this.name    = 'lite';
    this.options = options;

    /** Plafonds de ressources en mode léger */
    this.resource_limits = {
      memory:            '500MB',
      cpu:               '2 cores',
      disk:              '1GB',
      network:           'low',
      parallel_missions: 1,
    };

    /** Fonctionnalités conservées */
    this.features = [
      'basic_consciousness',   // conscience basique sans boucle de heartbeat intensive
      'visual_perception',     // vision via screenshot léger
      'simple_planning',       // planification séquentielle (pas hiérarchique)
      'sequential_execution',  // une mission à la fois
      'memory_basic',          // mémoire court-terme en RAM uniquement
      'hitl_telegram',         // supervision humaine via Telegram
    ];

    this._active = false;
  }

  /**
   * Active le mode léger :
   *   - Positionne les variables d'environnement Chimera
   *   - Désactive swarm, audio, planification complexe
   * @returns {Promise<{mode: string, features: string[], limits: object}>}
   */
  async activate() {
    if (this._active) {
      console.log('[LiteMode] Déjà actif');
      return this.getStatus();
    }

    console.log('[Chimera] Mode LÉGER en cours d\'activation...');

    // ── Variables d'environnement ────────────────────────────────────────────
    process.env.CHIMERA_TIER       = 'LITE';
    process.env.LITE_MODE          = 'true';

    // Ressources Python limitées à 1 worker
    process.env.PYTHON_MAX_WORKERS = '1';

    // Désactiver les sous-systèmes lourds
    process.env.DISABLE_SWARM                = 'true';
    process.env.CONSCIOUSNESS_ENABLED        = 'false';
    process.env.EPISODIC_MEMORY_ENABLED      = 'false';
    process.env.STRATEGIST_ENABLED           = 'false';
    process.env.VOICE_ENABLED                = 'false';

    // Perception visuelle uniquement (pas audio)
    process.env.PERCEPTION_RESOLUTION        = '0.4';
    process.env.PARALLEL_MISSIONS            = '1';

    this._active = true;
    console.log('[Chimera] Mode Léger activé — ressources optimisées');

    return {
      mode:     this.name,
      features: this.features,
      limits:   this.resource_limits,
    };
  }

  /**
   * Désactive le mode léger (remet les flags à leur état neutre).
   */
  async deactivate() {
    if (!this._active) return;
    process.env.LITE_MODE   = 'false';
    process.env.DISABLE_SWARM = 'false';
    this._active = false;
    console.log('[LiteMode] Désactivé');
  }

  /** @returns {boolean} */
  isActive() { return this._active; }

  /** @returns {{ active: boolean, mode: string, features: string[] }} */
  getStatus() {
    return {
      active:   this._active,
      mode:     this.name,
      features: this.features,
      limits:   this.resource_limits,
    };
  }
}
