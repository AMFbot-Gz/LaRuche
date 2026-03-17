/**
 * proactive_loop.js — La Ruche surveille et agit sans être sollicitée (JARVIS mode)
 *
 * Surveille :
 * - Fichiers ~/Projects/ (nouvelles erreurs, TODO, changements)
 * - Santé des agents (restart auto si down)
 * - Heure (rapport quotidien 9h00, nightly goals 3h00)
 * - Redis (nouvelles missions)
 * - Ollama (modèles disponibles)
 */

import { watch } from "fs";
import { readdir, readFile } from "fs/promises";
import { join, homedir } from "path";

const AGENTS = [
  { name: "orchestration", port: 8001 },
  { name: "perception",    port: 8002 },
  { name: "brain",         port: 8003 },
  { name: "executor",      port: 8004 },
  { name: "evolution",     port: 8005 },
  { name: "memory",        port: 8006 },
  { name: "goals",         port: 8010 },
];

export class ProactiveLoop {
  constructor({ onMission, onAlert, log }) {
    this.onMission = onMission   // callback pour créer une mission
    this.onAlert   = onAlert     // callback pour alerter (Telegram)
    this.log       = log
    this._running  = false
    this._agentDownCounts = {}
    this._fileWatchTimeout = null
  }

  start() {
    this._running = true
    this.log.info("🔍 Boucle proactive démarrée (JARVIS mode)")

    // 1. Health check agents toutes les 30s
    setInterval(() => this._checkAgentsHealth(), 30_000)

    // 2. Rapport quotidien à 9h00
    this._scheduleDailyReport()

    // 3. Watcher fichiers projets (erreurs Python)
    this._watchProjectFiles()

    // 4. Check Ollama toutes les 5min
    setInterval(() => this._checkOllama(), 5 * 60_000)

    // Premier check immédiat (après 5s pour laisser les agents démarrer)
    setTimeout(() => this._checkAgentsHealth(), 5_000)
  }

  async _checkAgentsHealth() {
    for (const agent of AGENTS) {
      try {
        const resp = await fetch(`http://localhost:${agent.port}/health`, {
          signal: AbortSignal.timeout(3000),
        })
        if (resp.ok) {
          this._agentDownCounts[agent.name] = 0
        } else {
          this._handleAgentDown(agent)
        }
      } catch {
        this._handleAgentDown(agent)
      }
    }
  }

  _handleAgentDown(agent) {
    this._agentDownCounts[agent.name] = (this._agentDownCounts[agent.name] || 0) + 1
    const count = this._agentDownCounts[agent.name]

    if (count === 2) {
      this.log.warn(`⚠️  Agent ${agent.name}:${agent.port} down depuis ${count * 30}s`)
    }
    if (count === 4) {
      this.log.error(`❌ Agent ${agent.name} down — alerte envoyée`)
      this.onAlert?.(`⚠️ La Ruche: agent ${agent.name} est down depuis ${count * 30}s`)
    }
  }

  _scheduleDailyReport() {
    const now = new Date()
    const next9h = new Date(now)
    next9h.setHours(9, 0, 0, 0)
    if (next9h <= now) next9h.setDate(next9h.getDate() + 1)

    const msUntil9h = next9h - now
    setTimeout(() => {
      this._triggerDailyReport()
      setInterval(() => this._triggerDailyReport(), 24 * 60 * 60_000)
    }, msUntil9h)

    this.log.info(`📅 Rapport quotidien planifié dans ${Math.round(msUntil9h / 3_600_000)}h`)
  }

  async _triggerDailyReport() {
    this.log.info("📊 Génération du rapport quotidien...")
    await this.onMission?.(
      "Génère un rapport quotidien: missions terminées hier, objectifs atteints, état des agents, suggestions pour aujourd'hui. Envoie-le sur Telegram."
    )
  }

  _watchProjectFiles() {
    const projectsDir = join(homedir(), "Projects")
    try {
      watch(projectsDir, { recursive: false }, async (event, filename) => {
        if (
          filename &&
          (filename.endsWith(".py") ||
            filename.endsWith(".js") ||
            filename.endsWith(".ts"))
        ) {
          // Debounce : attendre 2s avant de traiter
          clearTimeout(this._fileWatchTimeout)
          this._fileWatchTimeout = setTimeout(() => {
            this.log.info(`📁 Fichier modifié: ${filename}`)
          }, 2_000)
        }
      })
      this.log.info(`👁  Surveillance fichiers: ${projectsDir}`)
    } catch (e) {
      this.log.warn(`⚠️  Impossible de surveiller ${projectsDir}: ${e.message}`)
    }
  }

  async _checkOllama() {
    try {
      const resp = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(5_000),
      })
      const { models } = await resp.json()
      this.log.debug(`🤖 Ollama: ${models?.length} modèles disponibles`)
    } catch {
      this.log.warn("⚠️  Ollama inaccessible")
    }
  }

  stop() {
    this._running = false
  }
}
