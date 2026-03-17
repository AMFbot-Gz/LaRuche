<div align="center">

# La Ruche

**L'OS agentique IA qui pilote ton Mac**

[Installation](#installation) · [Démarrage](#démarrage) · [Architecture](#architecture) · [Docs](#docs)

</div>

## Ce que c'est

La Ruche = Ghost OS (Queen Node.js) + 9 agents Python + Dashboard Next.js + Computer Use.

Un agent IA autonome qui:
- **Voit et agit** sur ton Mac (Computer Use)
- **Travaille la nuit** sur des missions complexes
- **S'améliore tout seul** (Evolution agent, nightly)
- **Se contrôle via Telegram** ou Dashboard web

## Installation

### One-liner (recommandé)
```bash
curl -fsSL https://raw.githubusercontent.com/AMFbot-Gz/LaRuche/main/install.sh | bash
```

### Manuel
```bash
git clone https://github.com/AMFbot-Gz/LaRuche.git && cd LaRuche
make setup   # installe tout
make dev     # lance tout
```

### Docker
```bash
docker compose up -d
```

## Démarrage

```
make dev          # lancer tout (Queen :3000 + Dashboard :3001 + 9 agents)
make stop         # arrêter
make status       # état des services
make logs         # logs en direct

./ruche onboard   # wizard premier lancement
./ruche mission "Analyse mon code et crée un rapport"
./ruche health    # diagnostic complet
```

URLs:
- Dashboard: http://localhost:3001
- Queen API: http://localhost:3000
- Agents: http://localhost:8001-8010

## Architecture

```
La Ruche
├── apps/queen/        Ghost OS — Node.js orchestrateur
├── apps/dashboard/    Interface web Next.js
├── agents/            9 agents Python spécialisés
│   ├── brain/         LLM router + ThinkingLayer
│   ├── perception/    Screenshot + Vision IA
│   ├── executor/      Actions système + 58 outils
│   ├── evolution/     Auto-génération de skills
│   ├── memory/        ChromaDB mémoire vectorielle
│   ├── orchestration/ Planification HTN
│   ├── goals/         Objectifs autonomes
│   ├── mcp-bridge/    Serveurs MCP
│   └── discovery/     Découverte de ressources
├── install.sh         Installation one-liner
├── ruche              CLI complet
└── Makefile           Commandes dev
```

## Stack

| Composant | Tech |
|-----------|------|
| Orchestrateur | Node.js 20 + Hono |
| Agents | Python 3.11 + FastAPI |
| LLM local | Ollama (Nemotron, Qwen3, LLaMA) |
| LLM cloud | Claude claude-sonnet-4-6 (Computer Use) |
| Mémoire | ChromaDB vectorielle |
| Queue | Redis |
| Dashboard | Next.js 15 |
| Computer Use | PyAutoGUI + Claude Vision |

## Licence

MIT — Built by [Wiaam Hadara](https://github.com/AMFbot-Gz) & Clio (AI co-founder)
