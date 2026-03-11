/**
 * intentPipeline.js — Pipeline intention → plan → exécution avec vision loop
 *
 * Améliorations v2:
 *   - Vision entre chaque step (validation + détection d'erreurs)
 *   - Auto-correction sur échec (screenshot → analyse → replan step)
 *   - Playwright comme MCP prioritaire, AppleScript en fallback
 *   - Chargement dynamique des skills depuis workspace/skills/
 */

import { plan, isComputerUseIntent } from "./planner.js";
import { execa } from "execa";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

// ─── MCP caller direct ────────────────────────────────────────────────────────

async function callMCP(serverFile, toolName, args = {}, timeout = 20000) {
  const rpcRequest = JSON.stringify({
    jsonrpc: "2.0", id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });

  try {
    const { stdout, stderr } = await execa("node", [join(ROOT, "mcp_servers", serverFile)], {
      input: rpcRequest, cwd: ROOT, timeout, reject: false,
    });

    if (!stdout?.trim()) return { success: false, error: stderr || "Empty MCP response" };

    const parsed = JSON.parse(stdout.trim());
    if (parsed.error) return { success: false, error: parsed.error.message };

    const text = parsed.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : (parsed.result || { success: true });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Vision entre les steps ───────────────────────────────────────────────────

async function visionValidate(question) {
  try {
    // Appel Python vision.py pour analyser l'écran
    const { stdout } = await execa("python3", [
      join(ROOT, "src/vision.py"),
      "--fn", "analyze_screen",
      "--args", JSON.stringify({ question }),
    ], { cwd: ROOT, timeout: 15000, reject: false });

    const result = JSON.parse(stdout);
    return result?.response || "";
  } catch {
    return "";
  }
}

async function takeScreenshot() {
  // Essaie Playwright d'abord, puis PyAutoGUI
  const pwResult = await callMCP("playwright_mcp.js", "pw.screenshot", {}, 8000);
  if (pwResult?.success && pwResult?.path) return pwResult.path;

  const osResult = await callMCP("os_control_mcp.js", "screenshot", {}, 8000);
  return osResult?.path || null;
}

// ─── Chargement dynamique des skills ─────────────────────────────────────────

let _dynamicSkills = null;
let _dynamicSkillsTs = 0;

async function loadDynamicSkills() {
  if (_dynamicSkills && Date.now() - _dynamicSkillsTs < 30000) return _dynamicSkills;

  const skillsDir = join(ROOT, "workspace/skills");
  const handlers  = {};

  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      const indexPath = join(skillsDir, name, "index.js");
      if (!existsSync(indexPath)) continue;
      try {
        const mod = await import(`${indexPath}?t=${Date.now()}`);
        if (typeof mod.run === "function") {
          handlers[name] = (params) => mod.run(params);
        }
      } catch { /* skip broken skills */ }
    }
  }

  _dynamicSkills   = handlers;
  _dynamicSkillsTs = Date.now();
  return handlers;
}

// ─── Handlers builtin (fallback si pas d'index.js dans workspace) ─────────────

const BUILTIN_HANDLERS = {
  // Browser via Playwright (prioritaire)
  open_safari:          (p) => callMCP("browser_mcp.js",    "os.openApp",                    { app: "Safari" }),
  go_to_youtube:        (p) => callMCP("playwright_mcp.js", "pw.goto",                        { url: "https://www.youtube.com" }),
  search_youtube:       (p) => callMCP("playwright_mcp.js", "pw.searchYouTube",               { query: p.query || "relaxing music" }),
  play_first_result:    (p) => callMCP("playwright_mcp.js", "pw.clickFirstYoutubeResult",     {}),

  // HID générique
  open_app:             (p) => callMCP("browser_mcp.js",    "os.openApp",   { app: p.app || "Safari" }),
  focus_app:            (p) => callMCP("browser_mcp.js",    "os.focusApp",  { app: p.app || "Safari" }),
  goto_url:             (p) => callMCP("playwright_mcp.js", "pw.goto",       { url: p.url }),
  click_element:        (p) => callMCP("playwright_mcp.js", "pw.click",      { selector: p.selector }),
  fill_field:           (p) => callMCP("playwright_mcp.js", "pw.fill",       { selector: p.selector, text: p.text }),
  press_key:            (p) => callMCP("playwright_mcp.js", "pw.press",      { key: p.key || "Enter" }),
  take_screenshot:      (p) => callMCP("playwright_mcp.js", "pw.screenshot", {}),
  extract_text:         (p) => callMCP("playwright_mcp.js", "pw.extract",    { selector: p.selector }),

  // Terminal
  run_command:          (p) => callMCP("terminal_mcp.js",   "execSafe",      { command: p.command }),

  // OS
  type_text:            (p) => callMCP("os_control_mcp.js", "typeText",      { text: p.text || p.query || "" }),
  press_enter:          (p) => callMCP("browser_mcp.js",    "browser.pressEnter", {}),
};

// ─── Exécution d'un step avec vision validation ───────────────────────────────

async function executeStep(step, hudFn, useVision = false) {
  const { skill, params = {} } = step;

  hudFn?.({ type: "task_start", task: `${skill}(${JSON.stringify(params).slice(0, 50)})` });

  // Charger les skills dynamiques
  const dynamicSkills = await loadDynamicSkills();
  const handler = dynamicSkills[skill] || BUILTIN_HANDLERS[skill];

  if (!handler) {
    const e = { success: false, error: `Skill non trouvé: ${skill}` };
    hudFn?.({ type: "task_done", task: skill, status: "error" });
    return e;
  }

  let result;
  try {
    result = await handler(params);
  } catch (e) {
    result = { success: false, error: e.message };
  }

  // Vision validation si activée et step réussi
  if (useVision && result?.success !== false) {
    await new Promise(r => setTimeout(r, 800)); // laisser l'OS réagir
    const visionCheck = await visionValidate(
      `Le skill "${skill}" vient d'être exécuté. Qu'est-ce qui s'affiche à l'écran? Y a-t-il une erreur visible?`
    );

    if (visionCheck) {
      result._vision = visionCheck.slice(0, 200);
      // Détecter des signaux d'erreur dans la réponse vision
      const errorSignals = ["erreur", "error", "failed", "impossible", "introuvable", "not found", "popup", "alerte"];
      const hasError = errorSignals.some(s => visionCheck.toLowerCase().includes(s));
      if (hasError) {
        result._vision_warning = true;
        hudFn?.({ type: "thinking", agent: "Vision", thought: `⚠️ ${visionCheck.slice(0, 100)}` });
      }
    }
  }

  const ok = result?.success !== false;
  hudFn?.({ type: "task_done", task: skill, status: ok ? "ok" : "error" });
  return result;
}

// ─── Auto-correction sur échec ────────────────────────────────────────────────

async function tryAutoCorrect(failedStep, errorMsg, hudFn) {
  hudFn?.({ type: "thinking", agent: "Self-Correct", thought: `Tentative correction: ${failedStep.skill}` });

  // Screenshot + analyse vision
  const screenshotPath = await takeScreenshot();
  let visionContext = "";

  if (screenshotPath) {
    visionContext = await visionValidate(
      `Le skill "${failedStep.skill}" a échoué avec l'erreur: "${errorMsg}". Que vois-tu à l'écran? Que faut-il faire pour corriger?`
    );
  }

  if (!visionContext) return null;

  // Demander au LLM de proposer un step corrigé
  const prompt = `Un step a échoué dans LaRuche.
Skill échoué: ${failedStep.skill}
Paramètres: ${JSON.stringify(failedStep.params)}
Erreur: ${errorMsg}
Observation écran: ${visionContext.slice(0, 300)}

Skills disponibles: open_safari, go_to_youtube, search_youtube, play_first_result, open_app, focus_app, goto_url, click_element, fill_field, press_key, run_command

Propose un step JSON corrigé pour résoudre le problème:
{"skill": "nom_skill", "params": {...}}

JSON uniquement.`;

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.2:3b", prompt, stream: false, options: { temperature: 0.1 } }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    const match = data.response?.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* fallback to null */ }

  return null;
}

// ─── Pipeline principal ────────────────────────────────────────────────────────

export async function runIntentPipeline(intent, {
  hudFn, onPlanReady, onStepDone,
  useVision = process.env.LARUCHE_MODE !== "low",
  usePlaywright = true,
} = {}) {
  const startTime = Date.now();

  // 1. Planification
  hudFn?.({ type: "thinking", agent: "Planner", thought: `"${intent.slice(0, 60)}"` });
  const planResult = await plan(intent);

  if (planResult.error || planResult.steps.length === 0) {
    return { success: false, goal: intent, error: planResult.error || "Plan vide", steps: [], duration: Date.now() - startTime };
  }

  onPlanReady?.(planResult);
  hudFn?.({ type: "plan_ready", tasks: planResult.steps.length, goal: planResult.goal });

  // 2. Lancer Playwright si nécessaire
  if (usePlaywright) {
    const pwResult = await callMCP("playwright_mcp.js", "pw.launch", { browser: "chromium" }, 15000);
    if (!pwResult?.success) {
      hudFn?.({ type: "thinking", agent: "Planner", thought: "Playwright indisponible — fallback AppleScript" });
    }
  }

  // 3. Exécution séquentielle avec vision
  const results = [];
  let allOk = true;

  for (let i = 0; i < planResult.steps.length; i++) {
    const step = planResult.steps[i];
    hudFn?.({ type: "thinking", agent: "Operator", thought: `${i + 1}/${planResult.steps.length}: ${step.skill}` });

    let result = await executeStep(step, hudFn, useVision);

    // Auto-correction si échec
    if (result?.success === false && i < planResult.steps.length - 1) {
      const correctedStep = await tryAutoCorrect(step, result.error, hudFn);
      if (correctedStep) {
        hudFn?.({ type: "thinking", agent: "Self-Correct", thought: `Retry: ${correctedStep.skill}` });
        result = await executeStep(correctedStep, hudFn, useVision);
      }
    }

    results.push({ step, result });
    onStepDone?.(i + 1, planResult.steps.length, step, result);
    if (result?.success === false) allOk = false;

    // Pause adaptative: plus longue si vision activée
    const pauseMs = useVision ? 800 : 500;
    if (i < planResult.steps.length - 1) await new Promise(r => setTimeout(r, pauseMs));
  }

  const duration = Date.now() - startTime;
  hudFn?.({ type: "mission_complete", duration, cost: 0 });

  return { success: allOk, goal: planResult.goal, confidence: planResult.confidence, steps: results, model: planResult.model, duration };
}

export { isComputerUseIntent };
