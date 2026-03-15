// core/monitoring/distributed_health.js — Monitoring distribué des couches
import { circuitRegistry, CircuitState } from '../../utils/circuitBreaker.js';
import { SERVICES } from '../../utils/resilientFetch.js';

const LAYERS = [
  { name: 'Queen Python',  url: `http://localhost:${process.env.AGENT_ORCHESTRATION_PORT || 8001}/health`, service: SERVICES.QUEEN_PYTHON },
  { name: 'Perception',    url: `http://localhost:${process.env.AGENT_PERCEPTION_PORT    || 8002}/health`, service: SERVICES.PERCEPTION   },
  { name: 'Brain',         url: `http://localhost:${process.env.AGENT_BRAIN_PORT         || 8003}/health`, service: SERVICES.BRAIN        },
  { name: 'Executor',      url: `http://localhost:${process.env.AGENT_EXECUTOR_PORT      || 8004}/health`, service: SERVICES.EXECUTOR     },
  { name: 'Evolution',     url: `http://localhost:${process.env.AGENT_EVOLUTION_PORT     || 8005}/health`, service: SERVICES.EVOLUTION    },
  { name: 'Memory',        url: `http://localhost:${process.env.AGENT_MEMORY_PORT        || 8006}/health`, service: SERVICES.MEMORY       },
  { name: 'MCP Bridge',    url: `http://localhost:${process.env.AGENT_MCP_BRIDGE_PORT    || 8007}/health`, service: SERVICES.MCP_BRIDGE   },
  { name: 'Discovery',     url: `http://localhost:${process.env.AGENT_DISCOVERY_PORT     || 8008}/health`, service: SERVICES.DISCOVERY    },
  { name: 'Knowledge',     url: `http://localhost:${process.env.AGENT_KNOWLEDGE_PORT     || 8009}/health`, service: SERVICES.KNOWLEDGE    },
];

const BASE_INTERVAL = 15000;   // 15s en nominal
const MAX_INTERVAL  = 120000;  // 2min en backoff
const TIMEOUT_MS    = 3000;

export class DistributedHealthMonitor {
  constructor(eventBus) {
    this.bus     = eventBus;
    this.state   = new Map(); // name → { status, failures, lastCheck, latency }
    this.timers  = new Map();
    // Injecter le bus dans le registry des circuits dès construction
    circuitRegistry.setEventBus(eventBus);
  }

  start() {
    for (const layer of LAYERS) {
      this.state.set(layer.name, { status: 'unknown', failures: 0, lastCheck: null, latency: 0 });
      // Pré-enregistrer les circuits pour chaque service
      circuitRegistry.get(layer.service, { callTimeoutMs: TIMEOUT_MS });
      this._scheduleCheck(layer, BASE_INTERVAL);
    }
    console.log('[HealthMonitor] 🟢 Démarré — surveillance de', LAYERS.length, 'couches');
  }

  stop() {
    for (const [, tid] of this.timers) clearTimeout(tid);
    this.timers.clear();
    console.log('[HealthMonitor] 🔴 Arrêté');
  }

  _scheduleCheck(layer, delay) {
    const tid = setTimeout(async () => {
      await this._check(layer);
    }, delay);
    tid.unref?.();
    this.timers.set(layer.name, tid);
  }

  async _check(layer) {
    const t0 = Date.now();
    let ok = false;
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(layer.url, { signal: ctrl.signal });
      clearTimeout(timeout);
      ok = res.ok;
    } catch {}

    const prev  = this.state.get(layer.name);
    const latency = Date.now() - t0;

    if (ok) {
      if (prev.status !== 'ok') {
        console.log(`[HealthMonitor] ✅ ${layer.name} — récupéré (${latency}ms)`);
        this.bus?.emit('layer.recovered', { name: layer.name, latency });
        // Sync circuit : service rétabli → réinitialiser le circuit si ouvert
        const cb = circuitRegistry.get(layer.service);
        if (cb.getState().state !== CircuitState.CLOSED) {
          cb.reset();
        }
      }
      this.state.set(layer.name, { status: 'ok', failures: 0, lastCheck: Date.now(), latency });
      this._scheduleCheck(layer, BASE_INTERVAL);
    } else {
      const failures = prev.failures + 1;
      console.warn(`[HealthMonitor] ❌ ${layer.name} — DOWN (tentative ${failures})`);
      this.state.set(layer.name, { status: 'down', failures, lastCheck: Date.now(), latency });
      this.bus?.emit('layer.down', { name: layer.name, failures });
      // Backoff exponentiel : 15s → 30s → 60s → 120s
      const next = Math.min(BASE_INTERVAL * Math.pow(2, failures - 1), MAX_INTERVAL);
      this._scheduleCheck(layer, next);
    }
  }

  /**
   * État combiné santé + circuits — utilisé par le dashboard /status.
   */
  getStatus() {
    const out = {};
    const circuits = circuitRegistry.getAll();
    for (const [name, s] of this.state) {
      // Retrouver le service associé à ce layer
      const layer = LAYERS.find(l => l.name === name);
      out[name] = {
        ...s,
        circuit: layer ? (circuits[layer.service] ?? null) : null,
      };
    }
    return out;
  }

  allHealthy() {
    return [...this.state.values()].every(s => s.status === 'ok');
  }
}

export default DistributedHealthMonitor;
