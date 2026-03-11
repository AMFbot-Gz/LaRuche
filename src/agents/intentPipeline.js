/**
 * intentPipeline.js — Pipeline complet : intention → plan → exécution
 *
 * Orchestration:
 *   1. planner.plan(intent) → JSON plan
 *   2. executeStep(step) pour chaque étape via browser_mcp / os_control_mcp
 *   3. HUD broadcast + Telegram feedback
 *
 * Chaque step appelle directement les MCP via toolRouter (pas de loop agent complète
 * pour minimiser la latence — on exécute les skills déterministement).
 */

import { plan, isComputerUseIntent } from "./planner.js";
import { execa } from "execa";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── MCP caller direct ────────────────────────────────────────────────────────
// Pas de ToolRouter TS (évite les problèmes de compilation) — appel MCP direct

async function callMCP(serverFile, toolName, args = {}) {
  const rpcRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });

  try {
    const { stdout, stderr } = await execa("node", [join(ROOT, "mcp_servers", serverFile)], {
      input: rpcRequest,
      cwd: ROOT,
      timeout: 15000,
      reject: false,
    });

    if (!stdout?.trim()) {
      return { success: false, error: stderr || "Empty MCP response" };
    }

    const parsed = JSON.parse(stdout.trim());
    if (parsed.error) return { success: false, error: parsed.error.message };

    const text = parsed.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : parsed.result;

  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Skill → MCP mapping ───────────────────────────────────────────────────────

const SKILL_HANDLERS = {
  open_safari:          async (params) => callMCP("browser_mcp.js", "os.openApp", { app: "Safari" }),
  go_to_youtube:        async (params) => callMCP("browser_mcp.js", "browser.goto", { url: "https://www.youtube.com" }),
  search_youtube:       async (params) => callMCP("browser_mcp.js", "browser.searchYouTube", { query: params.query || "music" }),
  play_first_result:    async (params) => callMCP("browser_mcp.js", "browser.clickFirstYoutubeResult", {}),

  // Skills génériques HID
  open_app:             async (params) => callMCP("browser_mcp.js", "os.openApp", { app: params.app || params.name || "Safari" }),
  focus_app:            async (params) => callMCP("browser_mcp.js", "os.focusApp", { app: params.app || params.name || "Safari" }),
  goto_url:             async (params) => callMCP("browser_mcp.js", "browser.goto", { url: params.url }),
  type_text:            async (params) => callMCP("os_control_mcp.js", "typeText", { text: params.text || params.query || "" }),
  press_enter:          async (params) => callMCP("browser_mcp.js", "browser.pressEnter", {}),
  take_screenshot:      async (params) => callMCP("os_control_mcp.js", "screenshot", {}),
};

// ─── Exécution d'un step ───────────────────────────────────────────────────────

async function executeStep(step, hudFn) {
  const { skill, params = {} } = step;

  hudFn?.({ type: "task_start", task: `${skill}(${JSON.stringify(params).slice(0, 50)})` });

  const handler = SKILL_HANDLERS[skill];
  if (!handler) {
    const err = { success: false, error: `Skill non implémenté: ${skill}` };
    hudFn?.({ type: "task_done", task: skill, status: "error" });
    return err;
  }

  try {
    const result = await handler(params);
    const ok = result?.success !== false;
    hudFn?.({ type: "task_done", task: skill, status: ok ? "ok" : "error" });
    return result;
  } catch (e) {
    hudFn?.({ type: "task_done", task: skill, status: "error" });
    return { success: false, error: e.message };
  }
}

// ─── Pipeline principal ────────────────────────────────────────────────────────

export async function runIntentPipeline(intent, { hudFn, onPlanReady, onStepDone } = {}) {
  const startTime = Date.now();

  // 1. Planification
  hudFn?.({ type: "thinking", agent: "Planner", thought: `Planification: "${intent.slice(0, 60)}"` });

  const planResult = await plan(intent);

  if (planResult.error || planResult.steps.length === 0) {
    return {
      success: false,
      goal: intent,
      error: planResult.error || "Plan vide — aucun skill applicable",
      steps: [],
      duration: Date.now() - startTime,
    };
  }

  onPlanReady?.(planResult);
  hudFn?.({ type: "plan_ready", tasks: planResult.steps.length, goal: planResult.goal });

  // 2. Exécution séquentielle des steps
  const results = [];
  let allOk = true;

  for (let i = 0; i < planResult.steps.length; i++) {
    const step = planResult.steps[i];
    hudFn?.({ type: "thinking", agent: "Operator", thought: `Step ${i + 1}/${planResult.steps.length}: ${step.skill}` });

    const result = await executeStep(step, hudFn);
    results.push({ step, result });
    onStepDone?.(i + 1, planResult.steps.length, step, result);

    if (result?.success === false) {
      allOk = false;
      // Continue quand même — certains steps peuvent échouer sans bloquer la suite
    }

    // Petite pause entre steps pour laisser l'OS réagir
    if (i < planResult.steps.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const duration = Date.now() - startTime;
  hudFn?.({ type: "mission_complete", duration, cost: 0 });

  return {
    success: allOk,
    goal: planResult.goal,
    confidence: planResult.confidence,
    steps: results,
    model: planResult.model,
    duration,
  };
}

// ─── Export utilitaire ─────────────────────────────────────────────────────────
export { isComputerUseIntent };
