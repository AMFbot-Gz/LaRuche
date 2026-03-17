# La Ruche — État du projet
*Mis à jour : 2026-03-17*

## Phase actuelle : v5.0 — JARVIS mode

## Ce qui est construit et fonctionne

### Infrastructure
- [x] Queen Node.js :3000 (Ghost OS — queen_oss.js, 863 LOC)
- [x] 11 agents Python FastAPI :8001-:8011
- [x] Dashboard Next.js :3001
- [x] Redis :6379 (Docker)
- [x] ChromaDB (mémoire vectorielle)
- [x] N8N :5678 (Docker — n8n-openclaw) — v1.107.4

### Agents Python actifs
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

### Capacités activées
- [x] Smart model routing (9 types → modèle optimal automatique)
- [x] Boucle proactive JARVIS (health check 30s, rapport 9h00, file watcher)
- [x] Computer Use loop (screenshot → Claude Vision → action → vérif)
- [x] Voice pipeline (Whisper → Queen → TTS)
- [x] Self-repair (crash reports + auto-patch)
- [x] Goals loop autonomes (SQLite, objectifs auto-générés)
- [x] ThinkingLayer (réflexion silencieuse avant réponse, LRU 200)
- [x] Circuit breaker Ollama (fail_max=5, exponential backoff)
- [x] N8N connecté (webhook bidirectionnel)
- [x] CLI `ruche` (onboard, start, stop, status, health, logs, mission)

### Modèles Ollama disponibles
| Modèle | Usage |
|--------|-------|
| qwen3-coder:480b-cloud | Code, debug (le meilleur) |
| gpt-oss:120b-cloud | Tâches lourdes/complexes |
| gpt-oss:20b-cloud | Général équilibré |
| glm-4.6:cloud | Raisonnement fort |
| minimax-m2:cloud | Créatif, multimodal |
| llama3.2-vision:latest | Vision screenshots |
| llava:7b, llava:latest | Vision alternative |
| llama3.2:3b | Ultra-rapide (<2s) |
| ghost-os-architect:latest | Custom La Ruche |
| nomic-embed-text:latest | Embeddings vectoriels |

## Ce qui reste à faire

### Priorité haute
- [ ] N8N workflows JSON production-ready (7 workflows importables)
- [ ] API key N8N configurée
- [ ] Tests d'intégration complets
- [ ] Package déploiement client

### Priorité moyenne
- [ ] Dashboard pages: sessions, memory, skills, pricing
- [ ] Evolution agent wired (Auto-Coder Bee actif)
- [ ] Swagger/OpenAPI docs pour tous les agents
- [ ] Métriques Prometheus + Grafana

### Futur
- [ ] Multi-tenant (workspace par utilisateur)
- [ ] Auth Clerk + Billing Stripe
- [ ] Déploiement Railway/Vercel
- [ ] SDK npm public

## Chemins importants
```
~/Projects/la-ruche/           — racine projet
├── apps/queen/src/            — Ghost OS Node.js
├── agents/                    — 11 agents Python
├── apps/dashboard/            — Next.js UI
├── infra/n8n_workflows/       — workflows N8N
├── packages/resilience/       — circuit breaker partagé
├── skills/                    — bibliothèque de patterns
└── ~/.ruche/logs/             — logs runtime
```

## Commandes clés
```bash
cd ~/Projects/la-ruche
make dev              # tout démarrer
make stop             # tout arrêter
./ruche status        # tableau de bord
./ruche health        # diagnostic
./ruche mission "..." # soumettre mission
make agents-status    # état 11 agents
```

## Repo GitHub
https://github.com/AMFbot-Gz/LaRuche (public, branche main)
