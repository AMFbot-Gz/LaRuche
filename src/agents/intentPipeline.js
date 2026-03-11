/**
 * intentPipeline.js - Pipeline intention -> plan -> exécution avec vision loop
 *
 * Améliorations v2:
 * - Vision entre chaque step (validation + détection d'erreurs)
 * - Auto-correction sur échec (screenshot -> analyse -> replan step)
 * - Playwright comme MCP prioritaire, AppleScript en fallback
 * - Chargement dynamique des skills depuis workspace/skills/
 */

import { plan, isComputerUseIntent } from "./planner.js";
import { execa } from "execa";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readdirSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../");
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

// --- MCP caller direct with Retry logic --------------------------------------

async function callMCP(serverFile, toolName, args = {}, timeout = 20000) {
  const rpcRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });

  let lastError = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { stdout, stderr } = await execa("node", [join(ROOT, "mcp_servers", serverFile)], {
        input: rpcRequest,
        cwd: ROOT,
        timeout: timeout * attempt, // Incremental timeout
        reject: false,
      });

      if (!stdout?.trim()) {
         if (stderr) throw new Error(stderr);
         throw new Error("Empty MCP response");
      }

      const parsed = JSON.parse(stdout.trim());
      if (parsed.error) throw new Error(parsed.error.message || "MCP Error");

      const text = parsed.result?.content?.[0]?.text;
      return text ? JSON.parse(text) : (parsed.result || { success: true });

    } catch (e) {
      lastError = e.message;
      console.warn(`[MCP Retry] ${toolName} attempt ${attempt} failed: ${lastError}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
      }
    }
  }

  return { success: false, error: `Failed after ${maxRetries} attempts: ${lastError}` };
}

// --- Vision entre les steps ---------------------------------------------------

async function visionValidate(question) {
  try {
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
  const pwResult = await callMCP("playwright_mcp.js", "pw.screenshot", {}, 8000);
  if (pwResult?.success && pwResult?.path) return pwResult.path;

  const osResult = await callMCP("os_control_mcp.js", "screenshot", {}, 8000);
  return osResult?.path || null;
}

// --- Chargement dynamique des skills -----------------------------------------

let _dynamicSkills = null;
let _dynamicSkillsTs = 0;

async function loadDynamicSkills() {
  if (_dynamicSkills && Date.now() - _dynamicSkillsTs < 30000) return _dynamicSkills;

  const skillsDir = join(ROOT, "workspace/skills");
  const handlers = {};

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

  _dynamicSkills = handlers;
  _dynamicSkillsTs = Date.now();
  return handlers;
}

// --- Handlers builtin --------------------------------------------------------

const BUILTIN_HANDLERS = {
  open_safari: (p) => callMCP("browser_mcp.js", "os.openApp", { app: "Safari" }),
  go_to_youtube: (p) => callMCP("playwright_mcp.js", "pw.goto", { url: "https://www.youtube.com" }),
  search_youtube: (p) => callMCP("playwright_mcp.js", "pw.searchYouTube", { query: p.query || "relaxing music" }),
  play_first_result: (p) => callMCP("playwright_mcp.js", "pw.clickFirstYoutubeResult", {}),
  open_app: (p) => callMCP("browser_mcp.js", "os.openApp", { app: p.app || "Safari" }),
  focus_app: (p) => callMCP("browser_mcp.js", "os.focusApp", { app: p.app || "Safari" }),
  goto_url: (p) => callMCP("playwright_mcp.js", "pw.goto", { url: p.url }),
  click_element: (p) => callMCP("playwright_mcp.js", "pw.click", { selector: p.selector }),
  fill_field: (p) => callMCP("playwright_mcp.js", "pw.fill", { selector: p.selector, text: p.text }),
  press_key: (p) => callMCP("playwright_mcp.js", "pw.press", { key: p.key || "Enter" }),
  take_screenshot: (p) => callMCP("playwright_mcp.js", "pw.screenshot", {}),
  extract_text: (p) => callMCP("playwright_mcp.js", "pw.extract", { selector: p.selector }),
  run_command: (p) => callMCP("terminal_mcp.js", "execSafe", { command: p.command }),
  type_text: (p) => callMCP("os_control_mcp.js", "typeText", { text: p.text || p.query || "" }),
  press_enter: (p) => callMCP("browser_mcp.js", "browser.pressEnter", {}),
};

// --- Exécution d'un step ------------------------------------------------------

async function executeStep(step, hudFn, useVision = false) {
  const { skill, params = {} } = step;
  hudFn?.({ type: "task_start", task: `${skill}(${JSON.stringify(params).slice(0, 50)})` });

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

  if (useVision && result?.success !== false) {
    await new Promise(r => setTimeout(r, 800));
    const visionCheck = await visionValidate(
      `Le skill "${skill}" vient d'être exécuté. Qu'est-ce qui s'affiche à l'écran? Y a-t-il une erreur visible?`
    );
    if (visionCheck) {
      result._vision = visionCheck.slice(0, 200);
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

// --- Auto-correction sur échec ------------------------------------------------

async function tryAutoCorrect(failedStep, errorMsg, hudFn) {
  hudFn?.({ type: "thinking", agent: "Self-Correct", thought: `Tentative correction: ${failedStep.skill}` });

  const screenshotPath = await takeScreenshot();
  let visionContext = "";
  if (screenshotPath) {
    visionContext = await visionValidate(
      `Le skill "${failedStep.skill}" a échoué avec l'erreur: "${errorMsg}". Que vois-tu à l'écran? Que faut-il faire pour corriger?`
    );
  }

  if (!visionContext) return null;

  const prompt = `Un step a échoué dans LaRuche. Skill échoué: ${failedStep.skill} Paramètres: ${JSON.stringify(failedStep.params)} Erreur: ${errorMsg} Observation écran: ${visionContext.slice(0, 300)} Propose un step JSON corrigé: {"skill": "nom_skill", "params": {...}}`;

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
  } catch { /* fallback */ }
  return null;
}

// --- Pipeline principal --------------------------------------------------------

export async function runIntentPipeline(intent, {
  hudFn, onPlanReady, onStepDone,
  useVision = process.env.LARUCHE_MODE !== "low",
  usePlaywright = true,
} = {}) {
  const startTime = Date.now();
  hudFn?.({ type: "thinking", agent: "Planner", thought: `"${intent.slice(0, 60)}"` });

  const planResult = await plan(intent);
  if (planResult.error || planResult.steps.length === 0) {
    return { success: false, goal: intent, error: planResult.error || "Plan vide", steps: [], duration: Date.now() - startTime };
  }

  onPlanReady?.(planResult);
  hudFn?.({ type: "plan_ready", tasks: planResult.steps.length, goal: planResult.goal });

  if (usePlaywright) {
    await callMCP("playwright_mcp.js", "pw.launch", { browser: "chromium" }, 15000).catch(() => {});
  }

  const results = [];
  let allOk = true;

  for (let i = 0; i < planResult.steps.length; i++) {
    const step = planResult.steps[i];
    hudFn?.({ type: "thinking", agent: "Operator", thought: `${i + 1}/${planResult.steps.length}: ${step.skill}` });

    let result = await executeStep(step, hudFn, useVision);

    if (result?.success === false) {
      const correctedStep = await tryAutoCorrect(step, result.error, hudFn);
      if (correctedStep) {
        hudFn?.({ type: "thinking", agent: "Self-Correct", thought: `Retry: ${correctedStep.skill}` });
        result = await executeStep(correctedStep, hudFn, useVision);
      }
    }

    results.push({ step, result });
    onStepDone?.(i + 1, planResult.steps.length, step, result);
    if (result?.success === false) allOk = false;

    const pauseMs = useVision ? 800 : 500;
    if (i < planResult.steps.length - 1) await new Promise(r => setTimeout(r, pauseMs));
  }

  const duration = Date.now() - startTime;
  hudFn?.({ type: "mission_complete", duration, cost: 0 });

  return { success: allOk, goal: planResult.goal, confidence: planResult.confidence, steps: results, model: planResult.model, duration };
}

export { isComputerUseIntent };
