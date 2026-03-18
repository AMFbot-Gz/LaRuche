/**
 * Skill : docker_control
 * Contrôle Docker via son CLI natif — containers, images, compose
 *
 * Exemples Telegram :
 *   "liste les containers Docker"
 *   "démarre le container redis"
 *   "arrête tous les containers"
 *   "montre les logs du container ruche-queen"
 *   "build l'image depuis ./apps/queen"
 */

import { execSync } from "child_process";

const DOCKER_BIN = "/usr/local/bin/docker";

// Actions autorisées
const ALLOWED_ACTIONS = ["ps", "images", "start", "stop", "restart", "logs", "stats", "info", "pull"];

export async function run({
  action = "ps",
  container = "",
  image = "",
  lines = 50,
  timeout = 15000,
} = {}) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    return {
      success: false,
      error: `Action non autorisée: "${action}". Actions valides: ${ALLOWED_ACTIONS.join(", ")}`,
    };
  }

  try {
    switch (action) {
      case "ps": {
        const out = execSync(`${DOCKER_BIN} ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`, {
          encoding: "utf-8",
          timeout,
        });
        const allOut = execSync(`${DOCKER_BIN} ps -a --format "table {{.Names}}\\t{{.Status}}"`, {
          encoding: "utf-8",
          timeout,
        });
        return { success: true, action, running: out.trim(), all: allOut.trim() };
      }

      case "images": {
        const out = execSync(
          `${DOCKER_BIN} images --format "table {{.Repository}}:{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}"`,
          { encoding: "utf-8", timeout }
        );
        return { success: true, action, images: out.trim() };
      }

      case "info": {
        const out = execSync(
          `${DOCKER_BIN} info --format "Server Version: {{.ServerVersion}}\\nContainers: {{.Containers}} (running: {{.ContainersRunning}})\\nImages: {{.Images}}\\nCPUs: {{.NCPU}}\\nMemory: {{.MemTotal}}"`,
          { encoding: "utf-8", timeout }
        );
        return { success: true, action, info: out.trim() };
      }

      case "start": {
        if (!container) return { success: false, error: "container requis pour start" };
        execSync(`${DOCKER_BIN} start ${container}`, { encoding: "utf-8", timeout });
        return { success: true, action, container, message: `${container} démarré` };
      }

      case "stop": {
        if (!container) {
          // Arrêter tous les containers en cours
          const running = execSync(`${DOCKER_BIN} ps -q`, { encoding: "utf-8", timeout }).trim();
          if (!running) return { success: true, action, message: "Aucun container en cours" };
          execSync(`${DOCKER_BIN} stop ${running.split("\n").join(" ")}`, {
            encoding: "utf-8",
            timeout: 30000,
          });
          return { success: true, action, message: "Tous les containers arrêtés" };
        }
        execSync(`${DOCKER_BIN} stop ${container}`, { encoding: "utf-8", timeout });
        return { success: true, action, container, message: `${container} arrêté` };
      }

      case "restart": {
        if (!container) return { success: false, error: "container requis pour restart" };
        execSync(`${DOCKER_BIN} restart ${container}`, { encoding: "utf-8", timeout: 30000 });
        return { success: true, action, container, message: `${container} redémarré` };
      }

      case "logs": {
        if (!container) return { success: false, error: "container requis pour logs" };
        const out = execSync(`${DOCKER_BIN} logs --tail ${lines} ${container}`, {
          encoding: "utf-8",
          timeout,
        });
        return { success: true, action, container, logs: out.slice(0, 3000) };
      }

      case "stats": {
        const out = execSync(
          `${DOCKER_BIN} stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}"`,
          { encoding: "utf-8", timeout }
        );
        return { success: true, action, stats: out.trim() };
      }

      case "pull": {
        if (!image) return { success: false, error: "image requise pour pull" };
        const out = execSync(`${DOCKER_BIN} pull ${image}`, {
          encoding: "utf-8",
          timeout: 120000,
        });
        return { success: true, action, image, message: `${image} téléchargé` };
      }

      default:
        return { success: false, error: `Action inconnue: ${action}` };
    }
  } catch (e) {
    return { success: false, action, error: e.stderr?.slice(0, 500) || e.message };
  }
}
