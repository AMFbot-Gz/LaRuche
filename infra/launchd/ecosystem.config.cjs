/**
 * ecosystem.config.cjs — PM2 v5/v6 Process Manager
 * La Ruche v5 — Queen + 11 Agents Python
 *
 * Usage:
 *   pm2 start infra/launchd/ecosystem.config.cjs
 *   pm2 save
 *
 * Variables d'env:
 *   LARUCHE_MODE=low|balanced|high  (défaut: balanced)
 */

"use strict";

const path = require("path");
const ROOT = path.resolve(__dirname, "../..");
const UV   = "/usr/local/bin/uv";
const VENV_UVICORN = path.join(ROOT, ".venv/bin/uvicorn");

const MODE = process.env.LARUCHE_MODE || "balanced";

// ─── Helper: agent Python via uv run uvicorn ──────────────────────────────
function pyAgent({ name, module, port, cwd }) {
  return {
    name,
    interpreter: "none",
    script: UV,
    args: `run uvicorn ${module} --host 0.0.0.0 --port ${port} --no-access-log`,
    cwd: cwd || ROOT,
    watch: false,
    autorestart: true,
    restart_delay: 5000,
    max_memory_restart: "300M",
    env: {
      PYTHONUNBUFFERED: "1",
      PYTHONPATH: ROOT,
      NODE_ENV: "production",
      LARUCHE_MODE: MODE,
      AGENT_BASE_URL: "http://localhost",
      OLLAMA_BASE_URL: "http://localhost:11434",
    },
    log_file: path.join(ROOT, `.laruche/logs/${name}.log`),
    error_file: path.join(ROOT, `.laruche/logs/${name}-error.log`),
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    merge_logs: true,
  };
}

module.exports = {
  apps: [

    // ── Queen Node.js :3000 ─────────────────────────────────────────────────
    {
      name: "laruche-queen",
      script: path.join(ROOT, "apps/queen/src/queen_oss.js"),
      interpreter: "node",
      cwd: path.join(ROOT, "apps/queen"),
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      // Libère le port 3000 avant démarrage pour éviter EADDRINUSE
      kill_timeout: 5000,
      max_memory_restart: MODE === "high" ? "1G" : MODE === "low" ? "200M" : "500M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        API_PORT: "3000",
        LARUCHE_MODE: MODE,
        STANDALONE_MODE: "true",
        HITL_AUTO_APPROVE: "true",
        QUEEN_MAX_PARALLEL: "3",
        LLM_TIMEOUT_MS: "90000",
      },
      log_file: path.join(ROOT, ".laruche/logs/queen.log"),
      error_file: path.join(ROOT, ".laruche/logs/queen-error.log"),
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },

    // ── :8001 Orchestration ─────────────────────────────────────────────────
    pyAgent({
      name: "agent-orchestration",
      module: "agents.orchestration.orchestration_agent:app",
      port: 8001,
    }),

    // ── :8002 Perception ────────────────────────────────────────────────────
    pyAgent({
      name: "agent-perception",
      module: "agents.perception.perception_agent:app",
      port: 8002,
    }),

    // ── :8003 Brain ─────────────────────────────────────────────────────────
    pyAgent({
      name: "agent-brain",
      module: "agents.brain.brain:app",
      port: 8003,
    }),

    // ── :8004 Executor ──────────────────────────────────────────────────────
    pyAgent({
      name: "agent-executor",
      module: "agents.executor.executor_agent:app",
      port: 8004,
    }),

    // ── :8005 Evolution (auto_coder_bee — cwd spécifique) ───────────────────
    pyAgent({
      name: "agent-evolution",
      module: "auto_coder_bee:app",
      port: 8005,
      cwd: path.join(ROOT, "agents/evolution"),
    }),

    // ── :8006 Memory ────────────────────────────────────────────────────────
    pyAgent({
      name: "agent-memory",
      module: "agents.memory.memory_agent:app",
      port: 8006,
    }),

    // ── :8007 MCP-Bridge (cwd spécifique) ───────────────────────────────────
    pyAgent({
      name: "agent-mcp-bridge",
      module: "mcp_bridge_agent:app",
      port: 8007,
      cwd: path.join(ROOT, "agents/mcp-bridge"),
    }),

    // ── :8008 Discovery ─────────────────────────────────────────────────────
    pyAgent({
      name: "agent-discovery",
      module: "agents.discovery.mapper_agent:app",
      port: 8008,
    }),

    // ── :8009 Knowledge ─────────────────────────────────────────────────────
    pyAgent({
      name: "agent-knowledge",
      module: "agents.knowledge.librarian_agent:app",
      port: 8009,
    }),

    // ── :8010 Goals ─────────────────────────────────────────────────────────
    pyAgent({
      name: "agent-goals",
      module: "agents.goals.goals_agent:app",
      port: 8010,
    }),

    // ── :8011 Voice ─────────────────────────────────────────────────────────
    pyAgent({
      name: "agent-voice",
      module: "agents.voice.voice_agent:app",
      port: 8011,
    }),

  ],
};
