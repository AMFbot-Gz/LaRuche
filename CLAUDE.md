# La Ruche — Jarvis opérationnel v5.0
*Contexte Claude Code — mis à jour 2026-03-18*

## Vision
La Ruche est un **OS Agent multi-agents 100% local** qui transforme un Mac en ruche IA autonome.
Zéro cloud requis, zéro coût token, vie privée totale.

## Architecture v5 — Turborepo monorepo

```
La Ruche (Turborepo)
├── apps/
│   ├── queen/          — Queen Node.js :3000 (Ghost OS, Butterfly Loop, ComputerUse)
│   ├── dashboard/      — Next.js :3001 (dashboard temps réel)
│   ├── gateway/        — API gateway TypeScript
│   └── ghost-daemon/   — Daemon système
├── agents/             — 11 agents Python FastAPI :8001-:8011
├── packages/           — Libs partagées (chimera-sdk, chimera-types, db, ui-kit…)
├── skills/
│   ├── core/           — 27 skills JS macOS natifs
│   ├── architecture/   — Docs patterns multi-agents
│   ├── python/         — Skills Python
│   └── n8n/            — Skills N8N
└── src/                — Code legacy / utilitaires
```

## Commandes de démarrage
```bash
cd /Users/wiaamhadara/LaRuche

# Démarrage complet
make start          # Lance queen + agents + dashboard

# Queen seule
STANDALONE_MODE=true node apps/queen/src/queen_oss.js

# Dashboard seul
cd apps/dashboard && npm run dev -- --port 3001

# Agents Python
python3 -m uvicorn agents.brain.main:app --port 8003

# Test mission
curl -X POST http://localhost:3000/api/mission \
  -H "Content-Type: application/json" \
  -d '{"command": "ta mission ici"}'
```

## 11 Agents Python FastAPI
| Port | Agent | Rôle |
|------|-------|------|
| :8001 | orchestration | Planification HTN, coordination missions |
| :8002 | perception | Screenshot, OCR, Claude Vision |
| :8003 | brain | LLM router, ThinkingLayer, smart routing |
| :8004 | executor | 10 outils, N8N connector, shell/file/web/CU |
| :8005 | evolution | Auto-Coder Bee, self-repair, skills factory |
| :8006 | memory | ChromaDB vectorielle, search sémantique |
| :8007 | mcp-bridge | Serveurs MCP |
| :8008 | discovery | Découverte ressources |
| :8009 | knowledge | Base de connaissances |
| :8010 | goals | Objectifs autonomes SQLite |
| :8011 | voice | Whisper M2 STT + macOS TTS |

## APIs Queen :3000
- `POST /api/mission` — Lance une mission
- `GET /api/missions/:id` — Statut temps réel
- `GET /api/agents` — État de l'essaim
- `GET /api/system` — CPU/RAM/Disque
- `GET /api/skills` — Skills disponibles
- `GET /api/status` — Status global
- `POST /webhook/n8n` — Webhook N8N bidirectionnel

## Skills disponibles — 27 (skills/core/)

### Computer Use — Contrôle macOS natif
| Skill | Description |
|-------|-------------|
| `accessibility_reader` | Lit l'arbre AX macOS, retourne tous les éléments UI sémantiques |
| `find_element` | Trouve un élément UI par description sémantique via l'arbre AX |
| `smart_click` | Clique sur un élément UI par description sémantique |
| `screen_elements` | Analyse sémantique complète de l'écran: app, résolution, éléments groupés |
| `take_screenshot` | Capture d'écran macOS, retourne le chemin |
| `mouse_control` | Contrôle souris via Python Quartz CoreGraphics (déplacer, cliquer, demo) |
| `press_key` | Appuie sur une touche clavier (Return, Space, Tab, Escape…) |
| `press_enter` | Appuie sur Entrée |
| `type_text` | Tape du texte dans le champ actif via AppleScript |
| `wait_for_element` | Attend qu'un élément UI apparaisse (polling AX + timeout) |

### Browser & Navigation
| Skill | Description |
|-------|-------------|
| `open_app` | Ouvre une application macOS (Safari, VSCode, Terminal, Finder…) |
| `goto_url` | Ouvre une URL dans Safari |
| `open_google` | Ouvre google.com dans Safari |

### Système & Fichiers
| Skill | Description |
|-------|-------------|
| `read_file` | Lit un fichier local (max 8000 chars) |
| `run_shell` | Exécute une commande shell de la liste blanche (ls, cat, grep, git…) |
| `run_command` | Exécute une commande shell sûre (ls, cat, git, npm, node, python3, curl) |
| `list_big_files` | Liste les N fichiers les plus lourds (exclude node_modules, .git) |
| `summarize_project` | Résumé structure projet (arbre, package.json, README) |
| `http_fetch` | Appel HTTP GET/POST, retourne le contenu texte |

### Organisation & Automatisation
| Skill | Description |
|-------|-------------|
| `organise_screenshots` | Organise les screenshots par date dans ~/Pictures/Screenshots |
| `organise_telechargements` | Organise ~/Downloads par type de fichier |
| `organise_les_screenshots_par_date_et_les` | Variante: organise screenshots + compression |
| `automatise_l_organisation_des_t_l_charge` | Variante: automatise organisation téléchargements |

### Communication & Intégration
| Skill | Description |
|-------|-------------|
| `telegram_notify` | Envoie un message Telegram (env: BOT_TOKEN + CHAT_ID) |
| `agent_bridge` | Pont ESM → Python: missions vers queen:8001 ou brain:8003 |
| `invoke_claude_code` | Lance Claude Code non-interactif (contourne session imbriquée) |
| `update_world_state` | Met à jour ~/world_state.json — procédure fin de mission |

## MCP Servers (apps/queen/mcp_servers/)
| Serveur | Rôle |
|---------|------|
| `browser_mcp.js` | Contrôle navigateur Playwright |
| `playwright_mcp.js` | Automation web avancée |
| `os_control_mcp.js` | Contrôle OS macOS (AppleScript, pyautogui) |
| `terminal_mcp.js` | Exécution terminal |
| `vision_mcp.js` | Analyse vision (llava, moondream) |
| `vault_mcp.js` | Stockage secrets sécurisé |
| `skill_factory_mcp.js` | Création de nouveaux skills à la volée |
| `janitor_mcp.js` | Nettoyage, maintenance |
| `rollback_mcp.js` | Rollback d'actions |
| `pencil_mcp.js` | Intégration Pencil (.pen design files) |
| `mcp-compressor/` | Compression contexte (économie tokens) |
| `mcp-context-manager/` | Gestion contexte long |

## Infrastructure
- **Redis** :6379 (Docker) — cache, pub/sub
- **ChromaDB** — mémoire vectorielle sémantique
- **SQLite** — goals, sessions, logs
- **N8N** :5678 (Docker) — orchestration workflows
- **Ollama** :11434 — modèles locaux

## Modèles Ollama disponibles
- Local : `llava:7b`, `llama3.2:3b`, `llama3:latest`, `moondream:latest`, `llama3.2-vision:latest`
- Cloud : `glm-4.6:cloud`, `qwen3-coder:480b-cloud`

## Smart Model Routing (brain :8003)
9 types de tâches → modèle optimal automatique :
- Vision/screenshot → `llava:7b` ou `moondream:latest`
- Code/architecture → `llama3.2:3b`
- Planification longue → `llama3:latest`
- Cloud si besoin → `glm-4.6:cloud`

## Optimisations actives
- `keep_alive: -1` → modèles restent en RAM
- `top_k: 20` → 50% moins de calcul par token
- `f16_kv: true` → 2x moins de RAM pour KV cache
- Fast path < 80 chars → 1 appel LLM (≈1.3s)
- `num_predict: 700` → stoppe la sur-génération
- ThinkingLayer LRU 200 — réflexion silencieuse avant réponse
- Circuit breaker Ollama (fail_max=5, exponential backoff)

## Capacités activées (v5)
- Boucle proactive JARVIS (health check 30s, rapport 9h00, file watcher)
- Computer Use loop (screenshot → Claude Vision → action → vérification)
- Voice pipeline (Whisper → Queen → TTS macOS)
- Self-repair (crash reports + auto-patch via evolution :8005)
- Goals loop autonomes (SQLite, objectifs auto-générés)
- N8N connecté (webhook bidirectionnel)

## Computer Use — Détection automatique
Active pour : "ouvre ...", "lance ...", "prends un screenshot", "va sur ...", "tape ...", "clique ..."

## Stack technique
- Runtime: Node.js 20+ ESM, pnpm workspaces, Turborepo
- API Queen: Hono + @hono/node-server
- WebSocket: ws :9002
- Frontend: Next.js 15 + React 19
- Python: FastAPI + uvicorn, ChromaDB, SQLite, Whisper
- Tests: Jest (ESM) + pytest + smoke tests maison
- CI: GitHub Actions

## Capacités héritées AMFbot-Suite
- **Engineering Senior** — TDD, types stricts, SOLID, jamais supprimer code sans couverture > 80%
- **Browser Control** — Navigation autonome, scraping DOM, formulaires, isolation process
- **Hardening** — Audit système CIS, backup Git avant modif config, confirmation explicite clés SSH
