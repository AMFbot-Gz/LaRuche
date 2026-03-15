/**
 * packages/runtime/src/ultimate_mode.js
 * @chimera/runtime — Mode Pleine Puissance
 *
 * Adapté de ghost-os-ultimate/runtime/modes/ultimate_mode.js
 * pour le contexte Chimera / LaRuche.
 *
 * Active toutes les couches :
 *   - Conscience universelle (boucle de heartbeat complète)
 *   - Mémoire épisodique (jusqu'à 10 000 épisodes)
 *   - Stratégiste : planification hiérarchique sur 5 missions parallèles
 *   - Perception multimodale (vision + audio)
 *   - Swarm multi-nœuds
 *   - HITL Telegram + skill factory
 *
 * Prérequis :
 *   RAM ≥ 16 GB, CPU ≥ 8 cœurs
 *   Queen sur QUEEN_URL (défaut http://localhost:3000)
 */

export class UltimateMode {
  constructor(options = {}) {
    this.name    = 'ultimate';
    this.options = options;

    /** Ressources illimitées en mode ultime */
    this.resource_limits = {
      memory:            'unlimited',
      cpu:               'maximum',
      disk:              'high',
      network:           'high',
      parallel_missions: 5,
    };

    /** Toutes les fonctionnalités actives */
    this.features = [
      'full_consciousness',       // conscience universelle complète
      'multi_modal_perception',   // vision + audio
      'strategic_planning',       // stratégiste multi-objectifs
      'hierarchical_planning',    // plans imbriqués sur plusieurs niveaux
      'continuous_learning',      // apprentissage continu par rétroaction
      'parallel_execution',       // 5 missions simultanées
      'advanced_monitoring',      // monitoring détaillé de chaque couche
      'skill_factory',            // génération dynamique de skills
      'swarm_coordination',       // coordination multi-nœuds
      'hitl_telegram',            // supervision humaine via Telegram
      'chimera_bus',              // bus d'événements inter-agents Chimera
      'episodic_memory',          // mémoire épisodique longue durée
    ];

    this._active = false;

    // URLs des services Chimera (configurables via env ou options)
    this._queenUrl = options.queen_url
      ?? process.env.QUEEN_URL
      ?? 'http://localhost:3000';

    // Listeners enregistrés pour pouvoir les retirer à la désactivation
    this._listeners = [];
  }

  /**
   * Active le mode ultime :
   *   - Positionne toutes les variables d'environnement Chimera
   *   - Enregistre les listeners sur le bus d'événements (si disponible)
   * @returns {Promise<{mode: string, features: string[], limits: object}>}
   */
  async activate() {
    if (this._active) {
      console.log('[UltimateMode] Déjà actif');
      return this.getStatus();
    }

    console.log('[Chimera] Mode ULTIME en cours d\'activation...');

    // ── Variables d'environnement ────────────────────────────────────────────
    process.env.CHIMERA_TIER              = 'ULTIMATE';
    process.env.LITE_MODE                 = 'false';
    process.env.DISABLE_SWARM             = 'false';
    process.env.CONSCIOUSNESS_ENABLED     = 'true';
    process.env.EPISODIC_MEMORY_ENABLED   = 'true';
    process.env.STRATEGIST_ENABLED        = 'true';
    process.env.PYTHON_MAX_WORKERS        = '8';
    process.env.PARALLEL_MISSIONS         = '5';
    process.env.PERCEPTION_RESOLUTION     = '1.0';
    process.env.SKILL_FACTORY_ENABLED     = 'true';
    process.env.SWARM_ENABLED             = 'true';
    process.env.CONTINUOUS_LEARNING       = 'true';
    process.env.QUEEN_URL                 = this._queenUrl;

    // ── Bus d'événements ─────────────────────────────────────────────────────
    // Le bus peut être injecté depuis la Queen après le démarrage complet.
    // On l'enregistre de façon paresseuse pour ne pas coupler ce package
    // aux internals de apps/queen.
    if (this.options.eventBus) {
      this._registerListeners(this.options.eventBus);
    }

    this._active = true;
    console.log('[Chimera] Mode Ultime activé — toutes les couches opérationnelles');

    return {
      mode:     this.name,
      features: this.features,
      limits:   this.resource_limits,
    };
  }

  /**
   * Désactive proprement le mode ultime.
   * Retire les listeners du bus d'événements s'ils ont été enregistrés.
   */
  async deactivate() {
    if (!this._active) return;

    // Retirer les listeners du bus si on en a un
    if (this.options.eventBus && this._listeners.length > 0) {
      for (const { event, fn } of this._listeners) {
        this.options.eventBus.off(event, fn);
      }
      this._listeners = [];
    }

    process.env.CHIMERA_TIER          = '';
    process.env.CONSCIOUSNESS_ENABLED = 'false';
    this._active = false;
    console.log('[UltimateMode] Désactivé');
  }

  /** @returns {boolean} */
  isActive() { return this._active; }

  /** @returns {object} */
  getStatus() {
    return {
      active:   this._active,
      mode:     this.name,
      features: this.features,
      limits:   this.resource_limits,
      queen_url: this._queenUrl,
    };
  }

  /**
   * Enregistre les listeners sur le bus d'événements Chimera.
   * Gère : heartbeat conscience, erreurs, plans stratégiques.
   * @param {object} eventBus — instance EventEmitter compatible
   * @private
   */
  _registerListeners(eventBus) {
    const onHeartbeat = (data) => {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(`[UltimateMode] Cycle ${data.cycle} — online: ${data.perception?.online}`);
      }
    };

    const onConsciousnessError = (data) => {
      console.error(`[UltimateMode] Erreur conscience : ${data.error}`);
    };

    const onStrategicPlan = (plan) => {
      console.log(`[UltimateMode] Plan stratégique : ${plan.objectives?.length ?? 0} objectif(s)`);
    };

    const onSelfAware = (data) => {
      console.log('[UltimateMode] Conscience : self-aware', data?.id ?? '');
    };

    const onShutdown = () => {
      console.log('[UltimateMode] Conscience : signal d\'arrêt reçu');
    };

    eventBus.on('consciousness.heartbeat',   onHeartbeat);
    eventBus.on('consciousness.error',       onConsciousnessError);
    eventBus.on('strategic.plan.created',    onStrategicPlan);
    eventBus.on('self.aware',                onSelfAware);
    eventBus.on('consciousness.shutdown',    onShutdown);

    // Mémoriser pour pouvoir retirer proprement
    this._listeners.push(
      { event: 'consciousness.heartbeat',  fn: onHeartbeat },
      { event: 'consciousness.error',      fn: onConsciousnessError },
      { event: 'strategic.plan.created',   fn: onStrategicPlan },
      { event: 'self.aware',               fn: onSelfAware },
      { event: 'consciousness.shutdown',   fn: onShutdown },
    );
  }
}
