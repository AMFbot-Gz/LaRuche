# LaRuche — Architecture

```
                        ┌─────────────────────────────────────────────────┐
                        │               TELEGRAM / CLI                     │
                        │  /start  /mission  /agent  /skill  /status      │
                        └───────────────────┬─────────────────────────────┘
                                            │
                        ┌───────────────────▼─────────────────────────────┐
                        │            src/queen_oss.js                      │
                        │  Butterfly Loop · Auth · HUD WS · Mission log   │
                        └──┬────────────┬───────────────┬─────────────────┘
                           │            │               │
              ┌────────────▼──┐  ┌──────▼──────┐  ┌────▼──────────────────┐
              │ src/model_    │  │ src/agents/  │  │  src/tools/           │
              │ router.js     │  │ agentLoop.ts │  │  toolRouter.ts        │
              │ Auto-detect   │  │ Session+Mem  │  │  Access control       │
              │ Ollama models │  │ Skills+LLM   │  │  MCP routing          │
              └────────────┬──┘  └──────┬──────┘  └────┬──────────────────┘
                           │            │               │
                        ┌──▼────────────▼───────────────▼──────────────────┐
                        │              src/llm/provider.ts                  │
                        │  Ollama · Anthropic · OpenAI · Kimi · OpenRouter  │
                        └───────────────────────────────────────────────────┘

                        ┌───────────────────────────────────────────────────┐
                        │                  MCP SERVERS                       │
                        │  os-control · terminal · vision · vault           │
                        │  skill-factory · rollback · janitor               │
                        └──────────────┬────────────────────────────────────┘
                                       │
              ┌────────────────────────┼──────────────────────────────┐
              │                        │                              │
   ┌──────────▼──────┐    ┌────────────▼──────────┐    ┌─────────────▼──────┐
   │  hud/main.js    │    │  dashboard/server.js   │    │  src/watcher.js    │
   │  Electron HUD   │    │  REST :8080 + WS proxy │    │  PM2 watchdog      │
   │  Ghost-Monitor  │    │  React SPA             │    │  Auto-restart      │
   └─────────────────┘    └───────────────────────┘    └────────────────────┘
```

## Directory Roles

### `src/` — Core Swarm Engine
| File/Dir | Role |
|----------|------|
| `queen_oss.js` | **Entry point** — Bot Telegram, Butterfly Loop, HUD WebSocket |
| `model_router.js` | Auto-detect Ollama models, route prompts to best model |
| `agents/agentLoop.ts` | Multi-agent loop: session → memory → skills → LLM → tools |
| `agents/agentBridge.js` | JS→TS bridge with fallback for uncompiled TypeScript |
| `llm/provider.ts` | Provider-agnostic LLM client (Ollama + cloud providers) |
| `tools/toolRouter.ts` | Route tool calls → MCP servers, access control |
| `db.js` | sql.js wrapper (pure JS SQLite, no native deps) |
| `skill_evolution.js` | Auto-create/patch/version skills via LLM |
| `organic_input.js` | Bézier + Gaussian HID for anti-bot mouse/keyboard |
| `vision.py` | LLaVA screen analysis + pHash fingerprinting |
| `voice_command.py` | Whisper offline STT + Silero VAD |
| `worker_pool.py` | Parallel Ollama workers (Kimi-Overdrive pattern) |
| `watcher.js` | PM2 watchdog — auto-restart queen on zombie |

### `mcp_servers/` — MCP Tool Servers
Each server exposes tools via JSON-RPC over stdio.

| Server | Tools | Risk |
|--------|-------|------|
| `os_control_mcp.js` | moveMouse, click, typeText, screenshot | High |
| `terminal_mcp.js` | exec, execSafe, listProcesses | High |
| `vision_mcp.js` | analyzeScreen, findElement, identifyCursorTarget | Low |
| `vault_mcp.js` | storeExperience, findSimilar, getProfile, addRule | Low |
| `skill_factory_mcp.js` | createSkill, evolveSkill, listSkills | Medium |
| `rollback_mcp.js` | createSnapshot, restore, purgeOldSnapshots | High |
| `janitor_mcp.js` | purgeTemp, gcRAM, getStats | Low |

### `workspace/` — Human-readable Layer (versionnable)
```
workspace/
├── memory/MEMORY.md      ← Long-term rules, preferences, lessons (edit this!)
├── skills/*/SKILL.md     ← Modular skill definitions with frontmatter
├── agents/*/AGENT.md     ← Agent souls: persona, tools, security
├── cron/jobs.yml         ← Scheduled jobs
└── sessions/             ← Auto-generated conversation history
```

### `config/` — Machine-readable Config
```
config/agents.yml    ← Agents + providers + tools mapping
```

### `.laruche/` — Runtime State (auto-managed, don't edit)
```
.laruche/
├── config.json          ← Runtime config (ports, models, limits)
├── registry.json        ← Skills registry
├── patron-profile.json  ← Learned user preferences
├── logs/                ← Rotating logs (24h TTL)
├── temp/                ← Auto-purged every 10min
└── rollback/            ← Snapshots (purged after 7 days)
```

### `vault/` — Vector Store (auto-managed)
ChromaDB persistent embeddings. Contains all agent experiences, error patterns, and semantic memories. Do not edit manually.

### `hud/` — Ghost-Monitor Overlay
Electron app, transparent + always-on-top + click-through.
Receives events from queen via WebSocket (port 9001).
Toggle with `Ctrl+Shift+H`.

### `dashboard/` — LaRuche HQ
Express server + React SPA on port 8080.
REST API + WebSocket proxy to HUD.

## Data Flow — Mission Lifecycle

```
User → Telegram → queen_oss.js
  1. Auth check (ADMIN_TELEGRAM_ID)
  2. butterflyLoop(command)
     a. autoDetectRoles() → select models
     b. Decompose via model_router (role=strategist)
     c. Execute tasks in parallel (role=worker)
     d. Synthesize (role=synthesizer)
  3. OR runAgent(agentName, task) via agentBridge
     a. Load session + memory + skills
     b. Loop: LLM → parse tool_calls → execute via toolRouter → observe
     c. Persist session, store in vault
  4. HUD broadcast via WebSocket
  5. Response → Telegram
```

## Run Modes

| Mode | Command | Processes | RAM | Use case |
|------|---------|-----------|-----|----------|
| Headless | `laruche start --headless` | queen + watcher | ~100MB | VPS, server |
| Balanced | `laruche start` | queen + watcher + dashboard | ~300MB | Default |
| Full | `laruche start --full` | + HUD Electron | ~450MB | Desktop |
| Dev | `laruche dev` | queen (live reload) | ~150MB | Development |

## Performance Profiles (`LARUCHE_MODE`)

| Profile | Models | Parallelism | HUD FPS | Log level |
|---------|--------|-------------|---------|-----------|
| `low` | llama3.2:3b only | 2 workers | 2/s | warn |
| `balanced` | auto-detect | 5 workers | 5/s | info |
| `high` | largest available | 10 workers | 30/s | debug |
