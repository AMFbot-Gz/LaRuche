/**
 * computer_use_loop.js — Boucle Computer Use autonome (Tony Stark mode)
 *
 * La boucle :
 * 1. Screenshot de l'écran
 * 2. Claude Vision analyse : qu'est-ce qui est visible ? que faut-il faire ?
 * 3. Executor agit : click, type, scroll
 * 4. Screenshot de vérification
 * 5. Repeat jusqu'à goal_achieved ou max_iterations
 *
 * Usage:
 *   const loop = new ComputerUseLoop()
 *   const result = await loop.run("Ouvre Safari et va sur github.com")
 */

export class ComputerUseLoop {
  constructor({ maxIterations = 20, stepDelayMs = 800, log } = {}) {
    this.maxIterations = maxIterations
    this.stepDelayMs = stepDelayMs
    this.log = log || console
    this._sessions = new Map()
  }

  async run(goal, { sessionId = null, onStep = null } = {}) {
    const sid = sessionId || `cu_${Date.now()}`
    const session = {
      id: sid,
      goal,
      startedAt: new Date().toISOString(),
      steps: [],
      status: "running"
    }
    this._sessions.set(sid, session)
    this.log.info?.(`[CU] Démarrage session ${sid}: ${goal.slice(0, 60)}`)

    for (let i = 0; i < this.maxIterations; i++) {
      try {
        // 1. Screenshot
        const screenshot = await this._screenshot()
        if (!screenshot) { this.log.warn("[CU] Screenshot échoué"); break }

        // 2. Claude Vision analyse
        const vision = await this._visionUnderstand(screenshot, goal)

        const step = { i, vision, action: vision?.next_action, timestamp: new Date().toISOString() }
        session.steps.push(step)
        onStep?.(step)

        this.log.info?.(`[CU] Step ${i+1}: ${vision?.ui_state?.slice(0,60)} → ${JSON.stringify(vision?.next_action)}`)

        // 3. Goal atteint ?
        if (vision?.goal_achieved) {
          session.status = "completed"
          this.log.info?.(`[CU] Goal atteint en ${i+1} étapes`)
          return { success: true, sessionId: sid, steps: i + 1, session }
        }

        // 4. Exécuter l'action
        if (vision?.next_action) {
          await this._executeAction(vision.next_action)
          await new Promise(r => setTimeout(r, this.stepDelayMs))
        }

      } catch (err) {
        this.log.error?.(`[CU] Erreur step ${i}: ${err.message}`)
        session.steps.push({ i, error: err.message })
      }
    }

    session.status = "max_iterations_reached"
    return { success: false, sessionId: sid, steps: this.maxIterations, session }
  }

  async _screenshot() {
    try {
      const resp = await fetch("http://localhost:8002/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "base64", quality: 70 }),
        signal: AbortSignal.timeout(10_000)
      })
      const data = await resp.json()
      return data.screenshot || data.data || data.image
    } catch {
      return null
    }
  }

  async _visionUnderstand(screenshotB64, goal) {
    try {
      const resp = await fetch("http://localhost:8002/vision_understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenshot_b64: screenshotB64, goal }),
        signal: AbortSignal.timeout(30_000)
      })
      return await resp.json()
    } catch (e) {
      return { ui_state: "vision unavailable", next_action: { type: "wait" }, goal_achieved: false }
    }
  }

  async _executeAction(action) {
    const { type, target, value, x, y } = action
    const body = { action: type, target, value, x, y }

    try {
      await fetch("http://localhost:8004/computer/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000)
      })
    } catch (e) {
      this.log.warn?.(`[CU] Action ${type} échouée: ${e.message}`)
    }
  }

  getSession(sessionId) {
    return this._sessions.get(sessionId)
  }

  listSessions() {
    return Array.from(this._sessions.values())
  }
}

// Routes pour exposer le Computer Use via l'API Queen
export function setupComputerUseRoutes(app, cuLoop) {
  app.post("/api/computer-use/start", async (c) => {
    const { goal, maxIterations = 20 } = await c.req.json()
    if (!goal) return c.json({ error: "goal requis" }, 400)

    const loop = cuLoop || new ComputerUseLoop({ maxIterations })

    // Lancer en arrière-plan
    const sessionId = `cu_${Date.now()}`
    loop.run(goal, { sessionId }).catch(err => console.error("[CU]", err))

    return c.json({ sessionId, goal, status: "started" })
  })

  app.get("/api/computer-use/sessions", (c) => {
    return c.json(cuLoop?.listSessions() || [])
  })

  app.get("/api/computer-use/sessions/:id", (c) => {
    const session = cuLoop?.getSession(c.req.param("id"))
    if (!session) return c.json({ error: "session not found" }, 404)
    return c.json(session)
  })
}
