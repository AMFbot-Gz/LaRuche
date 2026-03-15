/**
 * core/hitl_manager.js — La Conscience de Chimera (HITL Manager)
 *
 * Gestionnaire centralisé de toutes les interruptions Human-In-The-Loop.
 *
 * Cycle d'une interruption :
 *   1. hitlManager.request() crée une demande → Promise en attente
 *   2. Mission passe à WAITING_FOR_INPUT
 *   3. WS event `hitl_request` broadcasté vers le Dashboard
 *   4. Console : ASCII art avec question + instruction curl
 *   5. User répond via POST /api/hitl/:requestId/respond
 *   6. Mission repasse à RUNNING → Promise résolue → agentLoop continue
 *
 * Timeout :
 *   - Auto-refuse après HITL_TIMEOUT_SEC (défaut 120s)
 *   - JAMAIS de mission zombie — la mission continue sans l'action refusée
 *
 * Sécurité :
 *   - Chaque demande a un UUID unique (pas de collision entre missions parallèles)
 *   - Pas d'injection circulaire — deps injectées par queen_oss.js via inject()
 *   - Timeout strict avec clearTimeout sur résolution
 *   - respond() idempotent — retourne false si le requestId est inconnu/expiré
 */

import { randomUUID } from 'crypto';

const DEFAULT_TIMEOUT_MS = parseInt(process.env.HITL_TIMEOUT_SEC || '120') * 1000;

// ─── HITLManager ──────────────────────────────────────────────────────────────

class HITLManager {
  constructor() {
    /**
     * Map<requestId, { request: HitlRequest, resolve: Function, timer: NodeJS.Timeout }>
     * @private
     */
    this._pending = new Map();

    /**
     * Injected by queen_oss.js — null until inject() is called.
     * @private
     */
    this._broadcast = null;

    /**
     * Injected by queen_oss.js — updates mission state in the active missions store.
     * Signature: (missionId: string, newStatus: string) => void
     * @private
     */
    this._updateMissionStatus = null;
  }

  /**
   * Injecte les dépendances runtime depuis queen_oss.js.
   * Appelé une seule fois au démarrage, avant tout request().
   *
   * @param {{ broadcast: Function, updateMissionStatus: Function }} deps
   */
  inject({ broadcast, updateMissionStatus }) {
    this._broadcast = broadcast ?? null;
    this._updateMissionStatus = updateMissionStatus ?? null;
  }

  /**
   * Demande une approbation HITL.
   *
   * Retourne une Promise qui se résout quand l'utilisateur répond
   * ou que le timeout expire (approved: false).
   *
   * @param {string} missionId        — ID de la mission concernée
   * @param {string} question         — Question posée à l'utilisateur
   * @param {string[]} [options=[]]   — Options textuelles (vide = oui/non)
   * @param {number} [risk=0.5]       — Score de risque 0.0–1.0
   * @param {number} [timeoutMs]      — Timeout ms (défaut: HITL_TIMEOUT_SEC)
   * @returns {Promise<{approved: boolean, answer: string|null, reason: string}>}
   */
  async request(missionId, question, options = [], risk = 0.5, timeoutMs = DEFAULT_TIMEOUT_MS) {
    // Bypass via variables d'environnement (tests / mode trust)
    if (process.env.HITL_AUTO_APPROVE === 'true') {
      return { approved: true, answer: null, reason: 'auto_approve' };
    }
    if (process.env.HITL_AUTO_REJECT === 'true') {
      return { approved: false, answer: null, reason: 'auto_reject' };
    }

    const requestId = randomUUID();
    const now = Date.now();

    /** @type {HitlRequest} */
    const hitlRequest = {
      requestId,
      missionId,
      question,
      options,
      risk,
      timeoutMs,
      createdAt: now,
      expiresAt: now + timeoutMs,
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._handleTimeout(requestId, resolve);
      }, timeoutMs);

      this._pending.set(requestId, { request: hitlRequest, resolve, timer });

      // Side-effects asynchrones (non-bloquants)
      setImmediate(() => this._onNewRequest(hitlRequest));
    });
  }

  /**
   * Répondre à une demande HITL (depuis l'endpoint HTTP).
   *
   * @param {string} requestId   — UUID de la demande
   * @param {boolean} approved   — true = approuver, false = refuser
   * @param {string|null} answer — Réponse textuelle optionnelle
   * @returns {boolean} true si la demande existait, false si inconnue/expirée
   */
  respond(requestId, approved, answer = null) {
    const entry = this._pending.get(requestId);
    if (!entry) return false;  // déjà résolue ou inconnue

    clearTimeout(entry.timer);
    this._pending.delete(requestId);

    const { request } = entry;

    // Remet la mission en RUNNING
    this._updateMissionStatus?.(request.missionId, 'running');

    // Broadcast résolution vers Dashboard
    this._broadcast?.({
      type:      'hitl_resolved',
      requestId,
      missionId: request.missionId,
      approved,
      answer,
      reason:    'user_response',
      ts:        Date.now(),
    });

    const icon = approved ? '✅' : '❌';
    const label = approved ? 'APPROUVÉ' : 'REFUSÉ';
    console.log(`\n[HITL] ${icon} ${label} — "${request.question.slice(0, 70)}"${answer ? ` → "${answer}"` : ''}\n`);

    // Résoudre la Promise dans agentLoop.js
    entry.resolve({ approved, answer, reason: 'user_response' });
    return true;
  }

  /**
   * Retourne toutes les demandes HITL en attente.
   * @returns {HitlRequest[]}
   */
  getPending() {
    return Array.from(this._pending.values()).map(e => e.request);
  }

  /**
   * Retourne la demande en attente pour une mission donnée, ou null.
   * @param {string} missionId
   * @returns {HitlRequest | null}
   */
  getByMission(missionId) {
    for (const { request } of this._pending.values()) {
      if (request.missionId === missionId) return request;
    }
    return null;
  }

  /**
   * Nombre de demandes en attente.
   * @returns {number}
   */
  pendingCount() {
    return this._pending.size;
  }

  // ─── Privé ──────────────────────────────────────────────────────────────────

  /** @private */
  _handleTimeout(requestId, resolve) {
    const entry = this._pending.get(requestId);
    if (!entry) return;

    this._pending.delete(requestId);
    const { request } = entry;

    // Remet la mission en RUNNING même en cas de timeout
    this._updateMissionStatus?.(request.missionId, 'running');

    this._broadcast?.({
      type:      'hitl_resolved',
      requestId,
      missionId: request.missionId,
      approved:  false,
      answer:    null,
      reason:    'timeout',
      ts:        Date.now(),
    });

    const secs = Math.round(request.timeoutMs / 1000);
    console.warn(`\n[HITL] ⏱  Timeout ${secs}s — "${request.question.slice(0, 60)}" — auto-refus, mission continue\n`);

    resolve({ approved: false, answer: null, reason: 'timeout' });
  }

  /** @private */
  _onNewRequest(hitlRequest) {
    const { requestId, missionId, question, options, risk, timeoutMs, expiresAt } = hitlRequest;

    // 1. Met la mission en WAITING_FOR_INPUT
    this._updateMissionStatus?.(missionId, 'waiting_for_input');

    // 2. Broadcast WS → Dashboard
    this._broadcast?.({
      type:      'hitl_request',
      requestId,
      missionId,
      question,
      options,
      risk,
      timeoutMs,
      expiresAt,
      ts:        Date.now(),
    });

    // 3. Console "terminal MVP" — ASCII art
    this._printConsoleRequest(hitlRequest);
  }

  /** @private */
  _printConsoleRequest({ requestId, missionId, question, options, risk, timeoutMs }) {
    const W = 62; // largeur interne de la boîte

    const riskFilled = Math.round(risk * 10);
    const riskBar = '█'.repeat(riskFilled) + '░'.repeat(10 - riskFilled);
    const riskPct  = `${(risk * 100).toFixed(0)}%`;
    const riskLabel = risk < 0.4 ? '🟢 FAIBLE' : risk < 0.7 ? '🟡 MODÉRÉ' : '🔴 ÉLEVÉ';

    const pad = (s, n) => s.slice(0, n).padEnd(n);

    const displayOptions = options.length > 0
      ? options.map((o, i) => `  ${i + 1}. ${o}`)
      : ['  ✅ Approuver (approved: true)', '  ❌ Refuser   (approved: false)'];

    const border = '═'.repeat(W);
    const line   = (content = '') => `║ ${pad(content, W - 2)} ║`;

    console.log(`
╔${border}╗
${line('🤔 CHIMERA A BESOIN DE TOI')}
╠${border}╣
${line(`Mission  : ${missionId.slice(0, W - 12)}`)}
${line(`Risque   : [${riskBar}] ${riskPct} ${riskLabel}`)}
╠${border}╣
${line()}
${question.match(/.{1,58}/g)?.map(l => line(l)).join('\n') ?? line(question)}
${line()}
╠${border}╣
${displayOptions.map(o => line(o)).join('\n')}
╠${border}╣
${line(`Timeout  : ${Math.round(timeoutMs / 1000)}s — auto-refus si pas de réponse`)}
╠${border}╣
${line('Répondre via curl :')}
${line(`  curl -X POST http://localhost:3000/api/hitl/${requestId.slice(0, 22)}...`)}
${line(`       /respond -d '{"approved":true}'`)}
${line()}
${line(`  requestId complet : ${requestId}`)}
╚${border}╝`);
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const hitlManager = new HITLManager();
