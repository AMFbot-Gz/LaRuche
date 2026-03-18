/**
 * Skill : ollama_control
 * Contrôle Ollama via son CLI natif — list, pull, run, delete, show
 *
 * Exemples Telegram :
 *   "liste les modèles Ollama"
 *   "ollama pull llama3.2:3b"
 *   "génère du texte avec llava: décris cette image"
 *   "supprime le modèle ghost-os-architect"
 */

import { execSync, spawnSync } from "child_process";

const OLLAMA_BIN = "/usr/local/bin/ollama";

// Actions autorisées (jamais rm -rf ou system commands)
const ALLOWED_ACTIONS = ["list", "pull", "show", "run", "delete", "ps", "version"];

export async function run({
  action = "list",
  model = "",
  prompt = "",
  timeout = 30000,
} = {}) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    return {
      success: false,
      error: `Action non autorisée: "${action}". Actions valides: ${ALLOWED_ACTIONS.join(", ")}`,
    };
  }

  try {
    switch (action) {
      case "list": {
        const out = execSync(`${OLLAMA_BIN} list`, { encoding: "utf-8", timeout });
        const lines = out.trim().split("\n").slice(1); // skip header
        const models = lines.map((l) => {
          const parts = l.split(/\s+/);
          return { name: parts[0], id: parts[1], size: parts[2] + " " + parts[3] };
        });
        return { success: true, action, models, count: models.length };
      }

      case "ps": {
        const out = execSync(`${OLLAMA_BIN} ps`, { encoding: "utf-8", timeout });
        return { success: true, action, running: out.trim() };
      }

      case "version": {
        const out = execSync(`${OLLAMA_BIN} --version`, { encoding: "utf-8", timeout });
        return { success: true, action, version: out.trim() };
      }

      case "show": {
        if (!model) return { success: false, error: "model requis pour show" };
        const out = execSync(`${OLLAMA_BIN} show ${model}`, {
          encoding: "utf-8",
          timeout,
        });
        return { success: true, action, model, info: out.trim().slice(0, 2000) };
      }

      case "pull": {
        if (!model) return { success: false, error: "model requis pour pull" };
        // pull peut être long — on le lance et on attend
        const result = spawnSync(OLLAMA_BIN, ["pull", model], {
          encoding: "utf-8",
          timeout: 300000, // 5 min max pour un téléchargement
        });
        if (result.status !== 0) {
          return { success: false, error: result.stderr || "pull échoué" };
        }
        return { success: true, action, model, message: `${model} téléchargé` };
      }

      case "delete": {
        if (!model) return { success: false, error: "model requis pour delete" };
        const out = execSync(`${OLLAMA_BIN} rm ${model}`, {
          encoding: "utf-8",
          timeout,
        });
        return { success: true, action, model, message: `${model} supprimé` };
      }

      case "run": {
        if (!model) return { success: false, error: "model requis pour run" };
        if (!prompt) return { success: false, error: "prompt requis pour run" };
        // Appel HTTP direct à l'API Ollama (plus fiable que CLI pour les réponses)
        const body = JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { num_predict: 500 },
        });
        const curlOut = execSync(
          `curl -s -X POST http://localhost:11434/api/generate -H "Content-Type: application/json" -d '${body.replace(/'/g, "'\\''")}'`,
          { encoding: "utf-8", timeout: 60000 }
        );
        const resp = JSON.parse(curlOut);
        return {
          success: true,
          action,
          model,
          response: resp.response,
          tokens: resp.eval_count,
        };
      }

      default:
        return { success: false, error: `Action inconnue: ${action}` };
    }
  } catch (e) {
    return { success: false, action, error: e.stderr?.slice(0, 500) || e.message };
  }
}
