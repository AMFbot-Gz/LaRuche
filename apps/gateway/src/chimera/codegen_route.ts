/**
 * chimera/codegen_route.ts — Route Telegram /codegen pour l'Auto-Coder Bee
 *
 * Quand un utilisateur envoie "/codegen [description]" sur Telegram,
 * cette route :
 *   1. Parse la description
 *   2. Appelle POST /generate_and_run sur l'Auto-Coder Bee (:8005)
 *   3. Renvoie le résultat formaté à l'utilisateur Telegram
 *
 * Intégration : ajouter dans le bot Telegram principal
 *   import { registerCodegenRoute } from './chimera/codegen_route'
 *   registerCodegenRoute(bot)
 */

import { Bot, Context } from 'grammy'

const BEE_URL = process.env.AUTO_CODER_BEE_URL ?? 'http://localhost:8005'
const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID ? Number(process.env.ADMIN_TELEGRAM_ID) : null

// ─── Types ────────────────────────────────────────────────────────────────────

interface CodingTask {
  description: string
  context: Record<string, unknown>
  expected_output: string
  complexity: 'simple' | 'medium' | 'complex'
  save_on_success: boolean
  timeout_seconds: number
}

interface CodingTaskResult {
  task_id: string
  status: 'success' | 'failure' | 'timeout' | 'sandbox_reject'
  generated: {
    extracted_code: string
    model_used: string
    generation_ms: number
  }
  execution: {
    stdout: string
    stderr: string
    return_code: number
    duration_ms: number
    rejected_reason?: string
  }
  skill_saved: boolean
  skill_path: string | null
  total_ms: number
  error?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAuthorized(ctx: Context): boolean {
  if (!ADMIN_ID) return true  // Pas de restriction si non configuré
  return ctx.from?.id === ADMIN_ID
}

function parseArgs(text: string): { description: string; complexity: CodingTask['complexity'] } {
  // Retire "/codegen " du début
  const raw = text.replace(/^\/codegen\s*/i, '').trim()

  // Optionnel : préfixe de complexité "--simple", "--complex"
  const m = raw.match(/^--(simple|medium|complex)\s+(.+)/is)
  if (m) {
    return {
      complexity: m[1] as CodingTask['complexity'],
      description: m[2].trim(),
    }
  }

  return { complexity: 'medium', description: raw }
}

function formatResult(result: CodingTaskResult): string {
  const statusEmoji: Record<string, string> = {
    success:        '✅',
    failure:        '❌',
    timeout:        '⏱️',
    sandbox_reject: '🔒',
  }
  const emoji = statusEmoji[result.status] ?? '❓'

  const lines: string[] = [
    `${emoji} <b>Auto-Coder Bee</b> — ${result.status.toUpperCase()}`,
    `<i>Modèle : ${result.generated.model_used} · ${result.generated.generation_ms}ms gen · ${result.execution.duration_ms}ms exec</i>`,
    '',
  ]

  // Sortie d'exécution
  if (result.execution.stdout) {
    const out = result.execution.stdout.slice(0, 800)
    lines.push(`<b>Sortie :</b>\n<pre>${escapeHtml(out)}</pre>`)
  }

  // Erreur sandbox
  if (result.execution.rejected_reason) {
    lines.push(`<b>Rejeté :</b> ${escapeHtml(result.execution.rejected_reason)}`)
  }

  // Erreur exécution
  if (result.execution.stderr && result.status !== 'success') {
    const err = result.execution.stderr.slice(0, 400)
    lines.push(`<b>Erreur :</b>\n<pre>${escapeHtml(err)}</pre>`)
  }

  // Skill sauvegardé
  if (result.skill_saved && result.skill_path) {
    const name = result.skill_path.split('/').pop()
    lines.push(`\n💾 <b>Skill sauvegardé :</b> <code>${name}</code>`)
  }

  // Code généré (tronqué)
  const code = result.generated.extracted_code.slice(0, 600)
  lines.push(`\n<b>Code généré :</b>\n<pre><code class="language-python">${escapeHtml(code)}</code></pre>`)

  return lines.join('\n')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Appel Bee ────────────────────────────────────────────────────────────────

async function callAutoCoderBee(task: CodingTask): Promise<CodingTaskResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90_000)  // 90s timeout global

  try {
    const resp = await fetch(`${BEE_URL}/generate_and_run`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(task),
      signal:  controller.signal,
    })

    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`Bee HTTP ${resp.status}: ${body}`)
    }

    return await resp.json() as CodingTaskResult
  } finally {
    clearTimeout(timer)
  }
}

// ─── Enregistrement de la route ───────────────────────────────────────────────

export function registerCodegenRoute(bot: Bot): void {
  /**
   * Commande : /codegen [--simple|--medium|--complex] <description>
   *
   * Exemples :
   *   /codegen Compte les fichiers .py dans /tmp
   *   /codegen --complex Génère un rapport CSV des processus actifs
   */
  bot.command('codegen', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('⛔ Non autorisé.')
      return
    }

    const text = ctx.message?.text ?? ''
    const { description, complexity } = parseArgs(text)

    if (!description || description.length < 10) {
      await ctx.reply(
        '❓ <b>Usage :</b> <code>/codegen [--simple|--medium|--complex] description de la tâche</code>\n\n'
        + '<b>Exemples :</b>\n'
        + '• <code>/codegen Compte les fichiers .py dans /tmp</code>\n'
        + '• <code>/codegen --complex Génère un rapport CSV des processus actifs</code>',
        { parse_mode: 'HTML' }
      )
      return
    }

    // Accusé de réception
    const loading = await ctx.reply(
      `🤖 <b>Auto-Coder Bee</b> en cours...\n<i>${escapeHtml(description)}</i>`,
      { parse_mode: 'HTML' }
    )

    const task: CodingTask = {
      description,
      context:         {},
      expected_output: '',
      complexity,
      save_on_success: true,
      timeout_seconds: 10,
    }

    try {
      const result = await callAutoCoderBee(task)
      const msg    = formatResult(result)

      // Édite le message de chargement
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        msg,
        { parse_mode: 'HTML' }
      )
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      await ctx.api.editMessageText(
        ctx.chat!.id,
        loading.message_id,
        `❌ <b>Erreur Auto-Coder Bee</b>\n<pre>${escapeHtml(errMsg.slice(0, 500))}</pre>`,
        { parse_mode: 'HTML' }
      )
    }
  })
}
