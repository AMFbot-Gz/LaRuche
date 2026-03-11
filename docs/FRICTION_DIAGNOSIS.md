# LaRuche — Friction Diagnosis v3.2

## Onboarding User (just want the bot running)

| File/Dir | Friction | Impact | Priority |
|----------|----------|--------|----------|
| `ecosystem.config.js` | Points to `src/queen.js` not `src/queen_oss.js` | **BLOCKER** — bot won't start | P0 |
| `.env.example` | Lists GEMINI/GOOGLE/KIMI keys for minimal setup — confusing | User gives up on init | P0 |
| `fast_install.sh` | No `--dry-run`, no progress %, no clear error messages | Silent failure = mystery | P1 |
| `fast_install.sh` | Pulls `llava:7b` (4GB!) blocking install | 10+ min stall = abandonment | P1 |
| `bin/laruche.js` | No `--headless` mode — HUD Electron needs display (fails on VPS) | Can't run headless | P1 |
| `bin/laruche.js` | VERSION hardcoded as "3.0.0" (actual: 3.2.0) | Confusion | P2 |
| `README.md` | No single "copy-paste to get started" block | User has to figure it out | P1 |
| `.env.example` | `WORKSPACE_ROOT` hardcoded to `/Users/wiaamhadara/` | Wrong on any other machine | P0 |

## Onboarding Dev (want to understand/extend)

| File/Dir | Friction | Impact | Priority |
|----------|----------|--------|----------|
| `src/` | `queen.js` vs `queen_oss.js` — two entry points, unclear which is canonical | "Which file do I edit?" | P0 |
| `src/` | `.ts` files without `tsconfig.json` — can't run directly | TS files are decoration only | P1 |
| `src/` | Flat structure mixing Python/JS (vision.py, worker_pool.py in src/) | Mental model unclear | P2 |
| `config/agents.yml` | YAML parser is custom minimal (src/utils/yaml.ts) — subtle bugs | Wrong parsing = silent errors | P1 |
| `mcp_servers/` | No README explaining what each server does | Dev has to read all 7 files | P2 |
| `docs/` | Only INTEGRATION.md — no ARCHITECTURE.md, no CONTRIBUTING guide for MCPs | "Where do I add a tool?" | P1 |
| `package.json` | `"main": "src/queen.js"` — wrong entry | Confusion | P1 |
| `test/smoke.js` | Only tests CLI/Ollama, no agent loop or MCP coverage | False confidence | P2 |

## Perf/Resources

| File/Dir | Friction | Impact | Priority |
|----------|----------|--------|----------|
| `ecosystem.config.js` | No `LARUCHE_MODE` profile — max resources always | Kills low-RAM machines | P1 |
| `fast_install.sh` | Pulls 2 large Ollama models synchronously (llama3.2:3b + llava:7b) | 10-15min stall | P1 |
| `hud/src/App.jsx` | No `React.memo`, no throttle on HUD updates | Re-renders every WS event | P2 |
| `dashboard/src/App.jsx` | LogStream re-renders entire list each tick | Memory leak on long sessions | P2 |
| `mcp_servers/vision_mcp.js` | Spawns new Python process per vision call | 500ms overhead per call | P1 |
| `src/worker_pool.py` | `_global_session` not cleaned up on process exit | Unclosed connections | P2 |
| `node_modules/` | `electron@28` + `playwright` in prod deps — adds 500MB+ | Slow npm install | P2 |
