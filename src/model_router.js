/**
 * model_router.js — Routeur Intelligent de Modèles LaRuche
 * 100% Ollama local — Zéro cloud, zéro coût, vie privée totale
 *
 * Architecture Open Source:
 *   L1 Stratège    → glm-4.6 / gpt-oss:120b (raisonnement profond)
 *   L2 Architecte  → qwen3-coder (code, debug, skill factory)
 *   L3 Ouvrières   → llama3.2:3b ×10 (micro-tâches parallèles)
 *   L4 Vision      → llava / llama3.2-vision (analyse écran)
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONFIG_PATH = join(ROOT, ".laruche/config.json");

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

// Cache des modèles disponibles
let _availableModels = null;
let _lastFetch = 0;

/**
 * Récupère les modèles Ollama disponibles (cache 60s)
 */
export async function getAvailableModels() {
  if (_availableModels && Date.now() - _lastFetch < 60000) {
    return _availableModels;
  }
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    _availableModels = (data.models || []).map((m) => m.name);
    _lastFetch = Date.now();
    return _availableModels;
  } catch {
    return _availableModels || [];
  }
}

/**
 * Charge la config des rôles depuis .laruche/config.json (cache TTL 5min)
 */
let _roleConfigCache = null;
let _roleConfigTs = 0;
function loadRoleConfig() {
  if (_roleConfigCache && Date.now() - _roleConfigTs < 300000) return _roleConfigCache;
  try { _roleConfigCache = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")).models || {}; }
  catch { _roleConfigCache = {}; }
  _roleConfigTs = Date.now();
  return _roleConfigCache;
}

/**
 * Détection automatique du meilleur modèle pour chaque rôle
 * Basé sur les modèles réellement installés sur Ollama
 */
export async function autoDetectRoles() {
  const available = await getAvailableModels();
  const config = loadRoleConfig();

  const roles = {
    // L1 — Stratège (raisonnement profond, planification)
    strategist: config.strategist || findBest(available, [
      "glm-4.7", "glm-4.6", "glm-4.6:cloud",
      "gpt-oss:120b-cloud", "gpt-oss:120b",
      "qwen3:72b", "llama3.1:70b",
      "llama3:latest", "llama3.2:latest",
    ]),

    // L2 — Architecte (code, debug, skill factory)
    architect: config.architect || findBest(available, [
      "qwen3-coder:480b-cloud", "qwen3-coder:32b",
      "qwen3-coder:14b", "qwen3-coder",
      "deepseek-coder:33b", "codellama:34b",
      "llama3.2:3b",
    ]),

    // L3 — Ouvrières (micro-tâches rapides, parallèle)
    worker: config.worker || findBest(available, [
      "llama3.2:3b", "llama3.2:latest",
      "minimax-m2:cloud", "minimax-m2",
      "phi3:mini", "phi3",
      "llama3:latest",
    ]),

    // L4 — Vision (analyse écran, UI detection)
    vision: config.vision || findBest(available, [
      "llama3.2-vision:latest", "llama3.2-vision",
      "qwen3-vl:235b-cloud", "qwen3-vl",
      "llava:latest", "llava:13b", "llava",
      "moondream:latest", "moondream",
    ]),

    // L4b — Vision légère (screenshot rapide)
    visionFast: config.visionFast || findBest(available, [
      "moondream:latest", "moondream",
      "llava:7b", "llava:latest", "llava",
    ]),

    // Synthèse / Chain-of-Thought
    synthesizer: config.synthesizer || findBest(available, [
      "glm-4.6", "glm-4.6:cloud",
      "gpt-oss:20b-cloud", "gpt-oss:20b",
      "llama3.2:latest", "llama3:latest",
    ]),
  };

  return roles;
}

function findBest(available, candidates) {
  // O(n) — une seule Map lookup au lieu de 2 passes Array
  const availableSet = new Map(available.map(m => [m, true]));
  const availableNames = new Map(available.map(m => [m.split(":")[0], m]));
  for (const candidate of candidates) {
    if (availableSet.has(candidate)) return candidate;
    const base = candidate.split(":")[0];
    if (availableNames.has(base)) return availableNames.get(base);
  }
  return available[0] || "llama3.2:3b";
}

/**
 * Route une requête vers le modèle optimal
 */
export async function route(task, hint = null) {
  const roles = await autoDetectRoles();

  if (hint) return roles[hint] || roles.worker;

  const t = task.toLowerCase();

  // Détection code
  if (/\bcode\b|script|function|\bfonction\b|debug|refactor|\bprogramme\b|implement|\bclass\b|\bapi\b|fix\s+bug|écris\s+un|génère\s+un\s+script|python|javascript|typescript|bash|sql|algorithme/.test(t)) {
    return roles.architect;
  }

  // Détection vision/screen
  if (/vision|écran|screen|image|pixel|clic|bouton|interface|ui|screenshot/.test(t)) {
    return roles.vision;
  }

  // Détection stratégie/planification
  if (/plan|stratégie|décompose|analyse|architecture|mission|objectif/.test(t)) {
    return roles.strategist;
  }

  // Default: worker rapide
  return roles.worker;
}

/**
 * Appel Ollama avec routing automatique
 */
export async function ask(prompt, options = {}) {
  const {
    role = null,
    task = prompt,
    temperature = 0.3,
    stream = false,
    timeout = 60000,
  } = options;

  // Un seul appel autoDetectRoles() — évite le double appel quand role est fourni
  const roles = await autoDetectRoles();
  const model = role
    ? roles[role] || roles.worker
    : await route(task);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature },
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    return { text: data.response || "", model, success: true };
  } catch (e) {
    return { text: "", model, success: false, error: e.message };
  }
}

/**
 * Appel streaming
 */
export async function* stream(prompt, options = {}) {
  const { role = null, task = prompt, temperature = 0.7 } = options;
  const model = role
    ? (await autoDetectRoles())[role]
    : await route(task);

  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: true,
      options: { temperature },
    }),
  });

  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const j = JSON.parse(line);
        if (j.response) yield { token: j.response, model, done: j.done };
      } catch {}
    }
  }
}

/**
 * Affiche la configuration des rôles détectée
 */
export async function printRoles() {
  const roles = await autoDetectRoles();
  console.log("\n🐝 Configuration Modèles LaRuche (100% Ollama)\n");
  const icons = {
    strategist: "👑 L1 Stratège",
    architect: "🔧 L2 Architecte",
    worker: "⚡ L3 Ouvrière",
    vision: "👁 L4 Vision",
    visionFast: "📷 L4 Vision rapide",
    synthesizer: "🧠 Synthèse",
  };
  for (const [role, model] of Object.entries(roles)) {
    console.log(`  ${(icons[role] || role).padEnd(22)} → ${model}`);
  }
  console.log();
}
