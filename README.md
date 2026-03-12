<div align="center">

# 🐝✨ LaRuche — Ghost Swarm Autonomous Agent ✨🐝

### 🤖 Un essaim d'agents IA autonomes — 100% local, piloté depuis Telegram

**⚡ Aucun cloud. Aucun abonnement. Votre machine, votre IA.**

---

[![CI](https://github.com/AMFbot-Gz/LaRuche/actions/workflows/ci.yml/badge.svg)](https://github.com/AMFbot-Gz/LaRuche/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-3.3.0-F5A623?style=flat-square&logo=github)](https://github.com/AMFbot-Gz/LaRuche/releases)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-7C3AED?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-22%2F22-22C55E?style=flat-square)](test/smoke.js)
[![Ollama](https://img.shields.io/badge/Powered%20by-Ollama-FF6C37?style=flat-square)](https://ollama.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-F5A623?style=flat-square)](CONTRIBUTING.md)
[![Discussions](https://img.shields.io/badge/community-discussions-EC4899?style=flat-square&logo=github)](https://github.com/AMFbot-Gz/LaRuche/discussions)
[![Stars](https://img.shields.io/github/stars/AMFbot-Gz/LaRuche?style=flat-square&color=F5A623&logo=github)](https://github.com/AMFbot-Gz/LaRuche/stargazers)

</div>

---

## 🌟 Qu'est-ce que LaRuche ?

LaRuche est un **orchestrateur multi-agents** 100% local qui transforme votre machine en une ruche intelligente :

- 🐝 **Essaim d'agents** (Stratège, Architecte, Worker, Vision) pilotés par des LLM locaux via Ollama
- 🛠️ **19 MCP** pour contrôler votre OS, terminal, vision, fichiers, snapshots et plus
- 📲 **Bot Telegram** pour piloter l'essaim depuis votre smartphone
- 📊 **Dashboard React** + **HUD Electron** pour monitorer missions et agents en temps réel
- 🔒 **HITL obligatoire** + sandbox + audit trail pour ne jamais perdre le contrôle
- 💎 **Système de skills** dynamiques extensibles (inspiré de PicoClaw)

---

## ⚡ Démarrage rapide

```bash
# 1. Clone
git clone https://github.com/AMFbot-Gz/LaRuche.git && cd LaRuche

# 2. Install
bash scripts/fast_install.sh

# 3. Configure
cp .env.example .env
# → Ajouter TELEGRAM_BOT_TOKEN + ADMIN_TELEGRAM_ID dans .env

# 4. Lance !
laruche start
```

🌐 Dashboard : `http://localhost:8080`
📲 Telegram : `/mission "Analyse ce dossier et génère un rapport"`

---

## 🏗️ Architecture

```
📲 Telegram / 🖥️ API REST / ⌨️ CLI / 👁️ HUD
         ↓
🐝 queen_oss.js  ← Butterfly Loop (orchestrateur central)
         ↓
🧠 agentLoop.ts  ← Pipeline multi-agents
   ├── 🎯 Stratège    (GLM-4.6)   — décompose les missions
   ├── 🏛️ Architecte  (Qwen3)     — analyse structurée
   ├── ⚙️ Worker      (LLaMA 3.2) — exécution
   └── 👁️ Vision      (LLaVA)     — validation visuelle
         ↓
🔧 toolRouter.ts  ← Dispatch vers MCP
   ├── 🖥️ mcp-os-control    — souris, clavier, screenshots
   ├── 💻 mcp-terminal       — exec sécurisé, sandbox
   ├── 👁️ mcp-vision         — analyse écran, find element
   ├── 🗄️ mcp-vault          — mémoire persistante
   ├── 💎 mcp-skill-factory  — créer/évoluer des skills
   ├── 🔄 mcp-rollback       — snapshots/restore
   └── 🧹 mcp-janitor        — purge logs, RAM, temp
         ↓
📊 Dashboard (React/Vite :8080) + 🖥️ HUD Electron
```

---

## 💎 Système de Skills

LaRuche supporte des skills dynamiques inspirés de **PicoClaw** :

```bash
laruche skill list          # Voir tous les skills
laruche skill create        # Créer un nouveau skill
laruche skill inspect web-search  # Inspecter un skill
```

Structure d'un skill :
```
skills/
└── mon-skill/
    ├── SKILL.md       # Description, inputs, outputs, prompts
    └── manifest.yaml  # Metadata, permissions, MCP utilisés
```

---

## 🔧 Configuration

| Variable | Description | Requis |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token du bot Telegram | ✅ |
| `ADMIN_TELEGRAM_ID` | Votre ID Telegram | ✅ |
| `STANDALONE_MODE` | `true` pour mode API sans Telegram | ➖ |
| `OLLAMA_BASE_URL` | URL Ollama (défaut: localhost:11434) | ➖ |
| `ANTHROPIC_API_KEY` | Fallback Claude | ➖ |
| `OPENAI_API_KEY` | Fallback GPT | ➖ |

---

## 🛡️ Sécurité & Gouvernance

| Feature | Description |
|---|---|
| 🔒 **HITL obligatoire** | Validation humaine pour toute action sensible (timer 60s) |
| 🔐 **Sandbox terminal** | Bloque les commandes destructrices |
| 🛡️ **PathValidator** | Empêche les traversals et LFI |
| 📋 **AuditLogger** | Trail JSON de toutes les opérations |
| 💣 **Kill switch** | `/killall` — stop global en <3s |
| 🧹 **Janitor Pro** | Zero footprint après session |

---

## 🌐 Multi-canaux (roadmap)

| Canal | Statut |
|---|---|
| 📲 Telegram | ✅ Opérationnel |
| 🖥️ API REST | ✅ Standalone mode |
| ⌨️ CLI laruche | ✅ Opérationnel |
| 💬 Discord | 🔮 v4.0 |
| 💼 Slack | 🔮 v4.0 |

---

## 🤝 Contribuer

1. 🍴 Fork le repo
2. 🌿 Crée ta branche (`git checkout -b feat/ma-feature`)
3. ✅ Assure-toi que les tests passent (`node test/smoke.js`)
4. 📬 Ouvre une PR

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) pour les détails.

---

## 💬 Communauté

| 📌 | Lien |
|---|---|
| 🐝 Bienvenue | [Discussion #8](https://github.com/AMFbot-Gz/LaRuche/discussions/8) |
| 🗺️ Roadmap | [Discussion #9](https://github.com/AMFbot-Gz/LaRuche/discussions/9) |
| 🌟 Showcase | [Discussion #10](https://github.com/AMFbot-Gz/LaRuche/discussions/10) |
| ❓ FAQ & Q·A | [Discussion #11](https://github.com/AMFbot-Gz/LaRuche/discussions/11) |

---

<div align="center">

**Fait avec 🐝 par [AMFbot-Gz](https://github.com/AMFbot-Gz) — LaRuche v3.3 DX Edition**

*Votre machine. Vos agents. Votre ruche.* ✨

[![GitHub](https://img.shields.io/github/followers/AMFbot-Gz?style=social)](https://github.com/AMFbot-Gz)

</div>
