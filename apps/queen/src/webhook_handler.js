/**
 * webhook_handler.js — Reçoit les événements N8N et les dispatch à La Ruche
 *
 * N8N peut déclencher :
 * - Nouvelle email → mission d'analyse
 * - Nouveau commit GitHub → revue de code
 * - Fichier modifié → notification
 * - Planifié → rapport quotidien
 */

export function setupWebhooks(app) {
  // Endpoint principal que N8N appelle
  app.post('/webhook/n8n', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const { workflow, event, data } = body

    console.log(`[Webhook] N8N → ${workflow}: ${JSON.stringify(data).slice(0, 100)}`)

    // Transformer l'événement en mission pour l'orchestration
    const mission = buildMissionFromEvent(workflow, event, data)
    if (mission) {
      // Envoyer à l'orchestration agent
      const resp = await fetch('http://localhost:8001/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mission, source: 'n8n', priority: 'normal' })
      }).catch(e => ({ ok: false, error: e.message }))

      return c.json({ received: true, mission_created: resp.ok })
    }

    return c.json({ received: true, mission_created: false })
  })

  // Webhook test
  app.get('/webhook/test', (c) => c.json({ status: 'webhook_ready', timestamp: new Date().toISOString() }))
}

function buildMissionFromEvent(workflow, event, data) {
  const missions = {
    'email-received': `Analyser cet email et préparer une réponse: ${JSON.stringify(data)}`,
    'github-pr': `Faire une revue de code de cette PR: ${JSON.stringify(data)}`,
    'file-changed': `Un fichier a été modifié: ${data?.path} — analyser les changements`,
    'daily-report': `Générer le rapport quotidien de La Ruche: missions terminées, objectifs atteints, suggestions`,
    'default': data?.mission || `Traiter l'événement N8N: ${workflow}`
  }
  return missions[workflow] || missions[event] || missions['default']
}
