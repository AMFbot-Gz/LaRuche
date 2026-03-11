<div align="center">

# 🐝 LaRuche

### Un essaim d'agents IA autonomes — 100% local, piloté depuis Telegram

**Aucun cloud. Aucun abonnement. Votre machine, votre IA.**

[![CI](https://github.com/AMFbot-Gz/LaRuche/actions/workflows/ci.yml/badge.svg)](https://github.com/AMFbot-Gz/LaRuche/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-3.2.0-F5A623?style=flat-square)](https://github.com/AMFbot-Gz/LaRuche/releases)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-7C3AED?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-22%2F22-22C55E?style=flat-square)](test/smoke.js)
[![Ollama](https://img.shields.io/badge/Powered%20by-Ollama-FF6C37?style=flat-square)](https://ollama.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-F5A623?style=flat-square)](CONTRIBUTING.md)

<br/>

[**Démarrage rapide**](#-démarrage-rapide) · [**Documentation**](docs/) · [**Contribuer**](CONTRIBUTING.md) · [**Discussions**](https://github.com/AMFbot-Gz/LaRuche/discussions) · [**Changelog**](CHANGELOG.md)

</div>

---

## Qu'est-ce que LaRuche ?

LaRuche est un **système multi-agents open source** qui transforme votre machine en infrastructure IA de production locale.

Une commande Telegram déclenche une cascade autonome :

```
/mission "Analyse mon projet et propose des optimisations"
       │
       ▼
🧠 Stratège (GLM-4.6)     → Décompose en sous-tâches
⚡ Architecte (Qwen3)     → Analyse le code  
🔧 Worker (LLaMA 3.2)     → Exécute en parallèle
👁 Vision (LLaVA)         → Valide visuellement
       │
       ▼
✅ Résultat synthétisé → Telegram (< 10s)
```

**Vous recevez le résultat. Pas la complexité.**

---

## ✨ Pourquoi LaRuche ?

| | LaRuche | ChatGPT Plus | GitHub Copilot |
|--|---------|-------------|----------------|
| **100% local** | ✅ | ❌ | ❌ |
| **Coût mensuel** | 0€ | 20€/mois | 10€/mois |
| **Données privées** | ✅ | ❌ | ❌ |
| **Multi-agents spécialisés** | ✅ (4 rôles) | ❌ | ❌ |
| **Pilotage Telegram** | ✅ | ❌ | ❌ |
| **Extensible open source** | ✅ | ❌ | ⚠️ |

---

## 🚀 Démarrage rapide

### Prérequis

- [Node.js 20+](https://nodejs.org)
- [Python 3.9+](https://python.org)
- [Ollama](https://ollama.com) installé et lancé (`ollama serve`)
- Un bot Telegram (créez-en un via [@BotFather](https://t.me/BotFather))

### Installation en 3 étapes

```bash
# 1. Cloner
git clone https://github.com/AMFbot-Gz/LaRuche.git
cd LaRuche

# 2. Installer (script one-click)
bash scripts/fast_install.sh

# 3. Configurer (2 variables obligatoires)
cp .env.example .env
nano .env
#   TELEGRAM_BOT_TOKEN=votre_token_botfather
#   ADMIN_TELEGRAM_ID=votre_id_telegram
```

> 💡 Votre ID Telegram : envoyez `/start` à [@userinfobot](https://t.me/userinfobot)

### Lancement

```bash
laruche start
```

```
🐝 LaRuche v3.2 — 100% Local
🤖 Bot Telegram actif ✅
📺 Dashboard: http://localhost:8080
```

Envoyez `/start` à votre bot Telegram — c'est tout.

---

## 💬 Commandes Telegram

| Commande | Description |
|----------|-------------|
| `/mission <texte>` | Lancer une mission multi-agents |
| `/status` | État de tous les services |
| `/models` | Modèles Ollama actifs par rôle |
| `/skill <desc>` | Générer un skill par IA |
| Message libre | Déclenche une mission directe |

### Exemple de mission

```
/mission Liste les 10 fichiers JS les plus volumineux et propose des optimisations
```

```
🧠 Analyse avec glm-4.6...
📋 Plan d'exécution
  • Lister et trier les fichiers JS par taille
  • Analyser le contenu des 3 plus gros
  • Proposer des optimisations concrètes

⚡ [qwen3-coder] Tâche 2 terminée
✅ Voici les résultats...
⏱ 8.4s — Modèles: glm-4.6, qwen3-coder, llama3.2:3b
```

---

## 🏗️ Architecture

```
Telegram / CLI
     │
     ▼
src/queen_oss.js         ← Orchestrateur principal (Butterfly Loop)
     ├── model_router.js  ← Auto-sélection modèles Ollama par rôle
     ├── agents/          ← Multi-agent loop (TypeScript strict)
     │    ├── agentLoop.ts
     │    ├── agentBridge.js
     │    └── intentPipeline.js
     ├── llm/             ← Providers + fallback chain
     │    ├── provider.ts  (Ollama → Anthropic → OpenAI → Kimi)
     │    └── toolRouter.ts
     └── tools/           ← Sandbox + MCP routing
          │
          ▼
mcp_servers/             ← OS-control, terminal, vision, vault...
hud/                     ← Ghost-Monitor Electron (overlay)
dashboard/               ← LaRuche HQ React (port 8080)
workspace/               ← Skills, agents, mémoire (éditable)
config/                  ← Providers, tools, agents YAML
```

---

## 🌐 Mode Standalone (sans Telegram)

Testez et utilisez LaRuche **sans configurer de bot Telegram** — via l'API REST ou le dashboard web.

```bash
# Démarrer en mode standalone
STANDALONE_MODE=true node src/queen_oss.js
# ou
npm run standalone
```

```
🌐 API Standalone: http://localhost:3000
📖 Endpoints: http://localhost:3000/
```

### API REST

```bash
# Envoyer une mission
curl -X POST http://localhost:3000/api/mission \
  -H "Content-Type: application/json" \
  -d '{"command": "Liste les 5 fichiers les plus gros"}'
# → {"missionId": "m-...", "status": "pending"}

# Suivre la progression
curl http://localhost:3000/api/missions/m-...
# → {"status": "success", "result": "...", "duration": 8421}

# État du système
curl http://localhost:3000/api/status
```

| Endpoint | Description |
|----------|-------------|
| `POST /api/mission` | Envoyer une mission (async, retourne 202) |
| `GET /api/missions/:id` | Statut et résultat d'une mission |
| `GET /api/missions` | Historique paginé |
| `GET /api/status` | État du système |
| `GET /api/agents` | Liste des agents actifs |
| `POST /api/search` | Recherche dans l'historique |
| `GET /api/health` | Health check |

> Documentation complète : [`docs/STANDALONE_MODE.md`](docs/STANDALONE_MODE.md)

---

## 🖥️ CLI LaRuche

```bash
laruche start              # Démarrer l'essaim
laruche start --headless   # Sans dashboard (VPS/serveur)
laruche start --full       # Avec HUD Electron (desktop)
laruche dev                # Mode développement (verbose, no PM2)

laruche status             # État de tous les processus
laruche doctor             # Diagnostic complet
laruche models             # Modèles Ollama actifs

laruche skill list         # Skills disponibles
laruche skill create "description"  # Créer un skill par IA
laruche hive               # Marketplace communauté

laruche logs               # Logs temps réel
laruche stop               # Arrêter l'essaim
laruche rollback           # Restaurer un snapshot
```

---

## 👁️ HUD & Dashboard

**Dashboard Web** (`http://localhost:8080`)
- StatusGrid — État de chaque service
- MissionFeed — Historique missions en temps réel
- CostMeter — Tokens consommés, coût USD estimé
- TelegramConsole — Test commandes sans smartphone

**HUD Electron** (overlay always-on-top)
- MissionBar — Progression %, agent actif
- ThoughtStream — Raisonnement IA en streaming
- HITLModal — Approbation humaine avec countdown 60s
- ThermalGauge — Température CPU/GPU

```
Ctrl+Shift+H     → Toggle HUD
Ctrl+Shift+Space → Mode HITL interactif
```

---

## 🔒 Sécurité

- **HITL obligatoire** pour toute action irréversible ou destructive
- **Sandbox terminal** — patterns bloqués (`rm -rf /`, fork bomb, etc.)
- **Auth Telegram** — seul l'`ADMIN_TELEGRAM_ID` peut envoyer des commandes
- **PathValidator LFI** — zéro traversal de répertoires
- **AuditLogger** — trail JSON de toutes les opérations
- **Kill Switch** — `/killall` Telegram arrête tout en < 3s
- **Zero footprint** — Janitor Pro purge après chaque session

---

## 🔧 19 Modules MCP

| Module | Capacités |
|--------|-----------|
| `mcp-os-control` | moveMouse, click, typeText, screenshot |
| `mcp-terminal` | exec, execSafe, checkPrivilege |
| `mcp-vision` | analyzeScreen, findElement, watchChange |
| `mcp-vault` | storeExperience, findSimilar, getProfile |
| `mcp-skill-factory` | createSkill, evolveSkill, listSkills |
| `mcp-rollback` | createSnapshot, restore, purgeOldSnapshots |
| `mcp-janitor` | purgeTemp, rotateLogs, gcRAM |

---

## 📦 Stack technique

| Couche | Technologie |
|--------|-------------|
| Runtime | Node.js 20+ · Python 3.11 |
| IA | Ollama (GLM-4.6, Qwen3, LLaMA 3.2, LLaVA) |
| Bot | Telegraf.js v4 |
| HUD | Electron 28 |
| Frontend | React 18 + Vite |
| Mémoire | ChromaDB (vectoriel) + SQLite |
| Contrôle | RobotJS + PyAutoGUI |
| Process | PM2 |
| Types | TypeScript strict |

---

## 🗺️ Roadmap

### En cours — v3.3
- [ ] Streaming temps réel dans Telegram
- [ ] Support missions multi-fichiers
- [ ] Amélioration détection computer-use

### v4.0 — Vision
- [ ] Tests unitaires Jest complets (100+ tests)
- [ ] JWT auth dashboard
- [ ] Rate limiter Telegram
- [ ] Semantic search ChromaDB
- [ ] Provider fallback chain (Ollama→Anthropic→OpenAI)

Consultez les [issues](https://github.com/AMFbot-Gz/LaRuche/issues) pour contribuer.

---

## 🤝 Contribuer

LaRuche est **open source et construit par sa communauté**.

```bash
# Fork → Clone → Branch
git checkout -b feat/ma-feature

# Développer + tester
node test/smoke.js   # 22 tests smoke

# PR
git push origin feat/ma-feature
```

Consultez le [Guide de contribution](CONTRIBUTING.md) pour tous les détails.

**Première contribution ?** Issues labelisées [`good first issue`](https://github.com/AMFbot-Gz/LaRuche/issues?q=label%3A%22good+first+issue%22).

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Diagrammes Mermaid, flux de données |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Guide de contribution complet |
| [.github/SECURITY.md](.github/SECURITY.md) | Politique de sécurité |

---

<div align="center">

**🐝 LaRuche — Construite par des abeilles, pour des abeilles**

*"Une commande. Un essaim. Un résultat."*

<br/>

[⭐ Star](https://github.com/AMFbot-Gz/LaRuche) · [🐛 Bug](https://github.com/AMFbot-Gz/LaRuche/issues/new?template=bug_report.yml) · [💡 Feature](https://github.com/AMFbot-Gz/LaRuche/issues/new?template=feature_request.yml) · [💬 Discussions](https://github.com/AMFbot-Gz/LaRuche/discussions)

</div>
