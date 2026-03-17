# La Ruche — Architecture technique

## Vue d'ensemble

```
                    ┌─────────────────────────────────────────────┐
                    │              ENTRÉES                         │
                    │  Telegram · Voix · Dashboard · N8N · CLI     │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │           QUEEN NODE.JS :3000                │
                    │   Ghost OS — queen_oss.js                    │
                    │   ├── NeuralEventBus (event routing)         │
                    │   ├── ProactiveLoop (JARVIS mode)            │
                    │   ├── ComputerUseLoop (screenshot→act)       │
                    │   ├── CronRunner (jobs YAML planifiés)       │
                    │   ├── WebSocket :9002 (dashboard live)       │
                    │   └── Webhooks /webhook/n8n                  │
                    └──────────────────┬──────────────────────────┘
                                       │ HTTP REST
                    ┌──────────────────▼──────────────────────────┐
                    │         11 AGENTS PYTHON FastAPI             │
                    │                                              │
                    │  orchestration :8001 — planification HTN     │
                    │  perception    :8002 — screenshot + vision   │
                    │  brain         :8003 — LLM router + thinking │
                    │  executor      :8004 — outils + N8N + CU     │
                    │  evolution     :8005 — auto-code + repair    │
                    │  memory        :8006 — ChromaDB vectorielle  │
                    │  mcp-bridge    :8007 — MCP servers           │
                    │  discovery     :8008 — ressources            │
                    │  knowledge     :8009 — base connaissances    │
                    │  goals         :8010 — objectifs autonomes   │
                    │  voice         :8011 — Whisper STT + TTS     │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │              INFRASTRUCTURE                  │
                    │  Redis :6379     ChromaDB    SQLite           │
                    │  Ollama :11434   N8N :5678   Docker          │
                    └─────────────────────────────────────────────┘
```

## Flux d'une mission

```
1. Entrée (Telegram/Voice/Dashboard/N8N/CLI)
2. Queen reçoit le message
3. Queen → POST /orchestrate → orchestration :8001
4. Orchestration décompose en étapes (via brain :8003)
5. brain choisit le modèle optimal (smart routing)
6. brain appelle Ollama avec le bon modèle
7. Executor exécute les actions (outils, computer use, N8N)
8. Memory stocke le résultat (ChromaDB)
9. Réponse retournée au client (Telegram/Dashboard)
```

## Smart Model Routing

```
Prompt reçu → detect_task_type() → TaskType → MODEL_MAP → Ollama

CODE/DEBUG  → qwen3-coder:480b-cloud
VISION      → llama3.2-vision:latest
FAST        → llama3.2:3b (< 2s)
REASONING   → glm-4.6:cloud
GENERAL     → gpt-oss:20b-cloud
HEAVY       → gpt-oss:120b-cloud
CREATIVE    → minimax-m2:cloud
EMBED       → nomic-embed-text:latest
```

## N8N Integration

```
N8N :5678 ←→ La Ruche :3000

N8N → La Ruche:
  POST /webhook/n8n {workflow, event, data}
  → buildMissionFromEvent()
  → POST /orchestrate (orchestration :8001)

La Ruche → N8N:
  GET  /n8n/workflows        (via executor :8004)
  POST /n8n/trigger/{name}   (via executor :8004)
  POST /n8n/create           (via executor :8004)
```

## Déploiement client

```bash
# One-liner
curl -fsSL https://raw.githubusercontent.com/AMFbot-Gz/LaRuche/main/install.sh | bash

# Ou Docker
docker compose up -d

# Ou manuel
git clone https://github.com/AMFbot-Gz/LaRuche && cd LaRuche
./ruche onboard
```

## Variables d'environnement requises

| Variable | Requis | Usage |
|----------|--------|-------|
| TG_TOKEN | ✅ | Bot Telegram |
| TG_ADMIN | ✅ | Ton user ID Telegram |
| ANTHROPIC_API_KEY | ⭕ | Claude Vision (Computer Use) |
| OLLAMA_HOST | ✅ | LLM local |
| N8N_URL | ✅ | Automation |
| N8N_API_KEY | ⭕ | API programmatique N8N |
| REDIS_URL | ✅ | Queue/cache |
| CHIMERA_SECRET | ✅ | JWT/auth interne |
