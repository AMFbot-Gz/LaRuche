/**
 * computer_use_loop.js — Boucle principale Computer Use
 *
 * Pipeline : Screenshot → Claude Vision → Action → Vérification → Repeat
 * Intégré avec : NeuralEventBus, HITL Manager, 9 agents Python
 */

import { EventEmitter } from 'events';

// Patterns d'actions risquées qui déclenchent HITL
const RISKY_PATTERNS = [
  'delete', 'remove', 'format', 'install', 'uninstall',
  'shutdown', 'restart', 'rm ', 'sudo', 'password'
];

export class ComputerUseLoop extends EventEmitter {
  constructor({ eventBus, hitlManager, agentBaseUrl = 'http://localhost' }) {
    super();
    this.eventBus = eventBus;
    this.hitlManager = hitlManager;
    this.agentBaseUrl = agentBaseUrl;
    this.activeSessions = new Map();
  }

  /**
   * Démarre une session Computer Use
   * @param {string} sessionId - ID unique de session
   * @param {string} goal - Objectif en langage naturel
   * @param {object} options - maxIterations, timeoutMs, workspaceId, requireApproval
   */
  async start(sessionId, goal, options = {}) {
    const {
      maxIterations = 20,
      timeoutMs = 300000, // 5 minutes
      workspaceId = 'local',
      requireApproval = false
    } = options;

    if (this.activeSessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} déjà active`);
    }

    const session = {
      id: sessionId,
      goal,
      workspaceId,
      status: 'running',
      steps: [],
      startedAt: Date.now(),
      cancelled: false
    };

    this.activeSessions.set(sessionId, session);

    this.emit('session.started', { sessionId, goal, workspaceId });
    if (this.eventBus) {
      this.eventBus.emit('computer_use.started', { sessionId, goal });
    }

    try {
      const result = await this._runLoop(session, maxIterations, timeoutMs, requireApproval);
      session.status = result.success ? 'completed' : 'failed';
      session.endedAt = Date.now();

      this.emit('session.ended', { sessionId, ...result });
      if (this.eventBus) {
        this.eventBus.emit('computer_use.ended', { sessionId, ...result });
      }

      return result;
    } catch (err) {
      session.status = 'failed';
      session.endedAt = Date.now();
      this.emit('session.error', { sessionId, error: err.message });
      throw err;
    } finally {
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Stoppe une session active
   */
  cancel(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.cancelled = true;
      this.emit('session.cancelled', { sessionId });
    }
  }

  /**
   * Boucle principale interne
   */
  async _runLoop(session, maxIterations, timeoutMs, requireApproval) {
    const deadline = Date.now() + timeoutMs;
    const history = [];

    for (let i = 0; i < maxIterations; i++) {
      // Vérifier annulation
      if (session.cancelled) {
        return { success: false, reason: 'cancelled', steps: i };
      }

      // Vérifier timeout
      if (Date.now() > deadline) {
        return { success: false, reason: 'timeout', steps: i };
      }

      // 1. Capturer l'écran
      let screenshot;
      try {
        screenshot = await this._callAgent(8002, 'POST', '/screenshot', {
          format: 'png',
          quality: 85
        });
      } catch (err) {
        console.error(`[ComputerUse] Screenshot échoué étape ${i}:`, err.message);
        await this._sleep(1000);
        continue;
      }

      // 2. Claude Vision analyse
      let vision;
      try {
        vision = await this._callAgent(8002, 'POST', '/vision_understand', {
          screenshot_b64: screenshot.data,
          goal: session.goal,
          history: history.slice(-5)
        });
      } catch (err) {
        console.error(`[ComputerUse] Vision échoué étape ${i}:`, err.message);
        await this._sleep(2000);
        continue;
      }

      // Enregistrer le step
      const step = {
        index: i,
        timestamp: Date.now(),
        screenshot_b64: screenshot.data,
        vision,
        action: vision.next_action
      };
      session.steps.push(step);
      history.push({ action: JSON.stringify(vision.next_action), result: 'executed' });

      // Émettre pour Dashboard (temps réel)
      this.emit('step', { sessionId: session.id, step: i, vision, goal: session.goal });
      if (this.eventBus) {
        this.eventBus.emit('computer_use.step', {
          sessionId: session.id,
          step: i,
          uiState: vision.ui_state,
          nextAction: vision.next_action,
          progress: vision.goal_progress
        });
      }

      // Goal atteint ?
      if (vision.goal_achieved || vision.next_action.type === 'done') {
        return {
          success: true,
          steps: i + 1,
          finalState: vision.ui_state,
          progress: 100
        };
      }

      // 3. Vérifier si action risquée → HITL
      if (this._isRiskyAction(vision.next_action)) {
        if (this.hitlManager && requireApproval) {
          const { approved } = await this.hitlManager.request(
            session.id,
            `Action risquée détectée :\n${JSON.stringify(vision.next_action, null, 2)}\n\nApprouver ?`,
            ['Approuver', 'Refuser'],
            0.8,
            30000
          );
          if (!approved) {
            history.push({ action: JSON.stringify(vision.next_action), result: 'refusé_hitl' });
            continue;
          }
        }
      }

      // 4. Exécuter l'action
      try {
        await this._executeAction(vision.next_action);
      } catch (err) {
        console.error(`[ComputerUse] Action échouée étape ${i}:`, err.message);
        history.push({ action: JSON.stringify(vision.next_action), result: `erreur: ${err.message}` });
      }

      // 5. Pause UI (laisser l'écran se mettre à jour)
      await this._sleep(800);
    }

    return { success: false, reason: 'max_iterations_reached', steps: maxIterations };
  }

  /**
   * Exécute une action via l'Executor agent (port 8004)
   */
  async _executeAction(action) {
    switch (action.type) {
      case 'click': {
        // Convertir coordonnées relatives → absolues
        const screen = await this._callAgent(8002, 'GET', '/status', {});
        const absX = Math.round(action.x * (screen.screen_width || 1920));
        const absY = Math.round(action.y * (screen.screen_height || 1080));
        return this._callAgent(8004, 'POST', '/mouse_click', { x: absX, y: absY, button: 'left' });
      }
      case 'type':
        return this._callAgent(8004, 'POST', '/type_text', { text: action.value });

      case 'key':
        return this._callAgent(8004, 'POST', '/key_press', { key: action.value });

      case 'scroll':
        return this._callAgent(8004, 'POST', '/mouse_click', {
          x: Math.round(action.x * 1920),
          y: Math.round(action.y * 1080),
          button: 'scroll',
          direction: action.value || 'down'
        });

      case 'open_app':
        return this._callAgent(8004, 'POST', '/open_app', { app_name: action.target });

      case 'shell':
        return this._callAgent(8004, 'POST', '/run_command', { command: action.value, timeout: 30 });

      case 'wait':
        await this._sleep(parseInt(action.value) || 1000);
        return;

      default:
        console.warn(`[ComputerUse] Action inconnue: ${action.type}`);
    }
  }

  /**
   * Appel HTTP vers un agent Python
   */
  async _callAgent(port, method, path, body) {
    const url = `${this.agentBaseUrl}:${port}${path}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Agent :${port}${path} → ${res.status}: ${text}`);
    }
    return res.json();
  }

  /**
   * Détecter actions risquées
   */
  _isRiskyAction(action) {
    const actionStr = JSON.stringify(action).toLowerCase();
    return RISKY_PATTERNS.some(p => actionStr.includes(p));
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /**
   * Statut de toutes les sessions actives
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.values()).map(s => ({
      id: s.id,
      goal: s.goal,
      status: s.status,
      steps: s.steps.length,
      startedAt: s.startedAt
    }));
  }
}
