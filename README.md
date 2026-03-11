<div align="center">

# 🐝 LaRuche

**Ghost Swarm Autonomous Agent — v3.0 SINGULARITY**

*Transformez votre machine en infrastructure de production surhumaine*

[![Version](https://img.shields.io/badge/version-3.0.0-F5A623?style=for-the-badge)](https://github.com/AMFbot-Gz/LaRuche)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-7C3AED?style=for-the-badge)](LICENSE)
[![Community](https://img.shields.io/badge/Community-Ruche_Mondiale-F5A623?style=for-the-badge)](https://github.com/AMFbot-Gz/LaRuche/discussions)

```
Gemini (CEO) × Claude (CTO) × Kimi (Force de Frappe)
👁 Ghost-Monitor | 🧠 Synapse-Vault | 🌐 Ubiquité Totale
⚡ 19 Modules MCP | 🔧 12 Innovations | 📋 Cross-Platform
```

</div>

---

## 🎯 Vision

LaRuche est un système d'agents IA autonomes, hiérarchisés et auto-évolutifs. Une commande Telegram déclenche une cascade autonome :

```
Telegram → Gemini (stratégie) → Claude (architecture) → Kimi ×10 (exécution) → Vision (validation) → Résultat
```

L'utilisateur reçoit le résultat — pas la complexité.

---

## ⚡ Démarrage Rapide

```bash
# 1. Cloner
git clone https://github.com/AMFbot-Gz/LaRuche.git
cd LaRuche

# 2. Installer (one-click)
bash scripts/fast_install.sh

# 3. Configurer
laruche init

# 4. Lancer l'essaim
laruche start

# 5. Tester
# Envoyez /start sur Telegram → LaRuche répond
```

---

## 🏗️ Architecture — La Pyramide du Pouvoir

```
👑 L1 — Gemini Ultra      Vision stratégique, validation missions
🔧 L2 — Claude Code       Orchestration, Skill Factory, debugging
⚡ L3 — Kimi 2.5 ×10     Exécution parallèle, 2M tokens, code massif
👁 L4 — LLaVA (Vision)   Analyse écran, validation visuelle
🤖 L5 — RobotJS/PyAutoGUI Contrôle HID universel, Bézier
```

---

## 🔧 Modules MCP (19 serveurs)

| Module | Priorité | Capacités |
|--------|----------|-----------|
| `mcp-os-control` | P0 | moveMouse, click, typeText, calibrate, screenshot |
| `mcp-terminal` | P1 | exec, execSafe, checkPrivilege, listProcesses |
| `mcp-vision` | P0 | analyzeScreen, findElement, watchChange |
| `mcp-vault` | P2 | storeExperience, findSimilar, getProfile |
| `mcp-skill-factory` | P1 | createSkill, evolveSkill, listSkills |
| `mcp-rollback` | P2 | createSnapshot, restore, purgeOldSnapshots |
| `mcp-janitor` | P1 | purgeTemp, rotateLogs, gcRAM |

---

## 🌟 12 Innovations Exclusives

| # | Innovation | Description |
|---|-----------|-------------|
| 1 | 🎙 Whisper Offline | Commandes vocales < 200ms sans cloud |
| 2 | ⏪ Rollback Système | Annulation de TOUTE action en < 10s |
| 3 | 🔮 Predictive Preloading | Préchauffe les Skills avant la demande |
| 4 | 🖼 Screen Fingerprinting | Cache pHash — zéro appel LLM redondant |
| 5 | 🔍 Semantic Diff | Aperçu changements avant exécution |
| 6 | 🖥 Multi-Monitor | Support 2-4 écrans natif |
| 7 | 🧩 Skill Marketplace | Partage de skills npm-like |
| 8 | 🛡 Agent Watcher | Watchdog anti-zombie |
| 9 | 🌐 Distributed Mode | Multi-PC via WebSocket mesh |
| 10 | 🌡 Thermal Awareness | Réduit Kimi si T°CPU > 80°C |
| 11 | 📼 Mission Replay | Enregistrement + rejeu sessions |
| 12 | 💬 NL Config | Configuration via Telegram naturel |

---

## 🖥️ CLI LaRuche

```bash
laruche start          # Démarrer l'essaim
laruche stop           # Arrêter tous les agents
laruche status         # État du système
laruche doctor         # Diagnostic complet
laruche init           # Configuration interactive
laruche send "mission" # Envoyer une commande
laruche skill list     # Lister les skills
laruche skill create   # Créer un skill par IA
laruche hive           # Marketplace communauté
laruche rollback       # Restaurer un snapshot
laruche logs           # Logs temps réel
```

---

## 👁️ Ghost-Monitor HUD

Overlay Electron transparent, always-on-top, click-through :

- **MissionBar** — Progression %, agent actif, coût USD
- **ThoughtStream** — Raisonnement IA en streaming
- **GhostCursor** — Cercle SVG pulsant 800ms avant chaque clic
- **HITLModal** — Approve/Reject avec countdown 60s
- **CodeLive** — Code généré avec syntax highlighting
- **ThermalGauge** — Température CPU/GPU temps réel

```
Ctrl+Shift+H     → Toggle HUD
Ctrl+Shift+Space → Mode interactif (HITL)
```

---

## 📊 Dashboard HQ

Interface React/Vite sur `http://localhost:8080` :

- StatusGrid — État ON/OFF de chaque MCP server
- MissionFeed — Historique missions avec coûts
- CostMeter — Tokens consommés, USD dépensé
- GodButton — KILL_ALL (rouge) / RESURRECT (vert)
- TelegramConsole — Test commandes sans smartphone
- LogStream — Flux logs temps réel

---

## 🔒 Sécurité

- **HITL obligatoire** pour toute action irréversible (> 2$ ou destructive)
- **PathValidator LFI** — Zéro traversal de répertoires
- **ToolRegistry RBAC** — USER / ADMIN / ROOT
- **AuditLogger** — Trail JSON de toutes les opérations
- **Zero footprint** — Janitor Pro purge après chaque session
- **Kill Switch** — `/killall` Telegram arrête tout en < 3s

---

## 📦 Stack Technique

```
Runtime:    Node.js 20 + Python 3.11 + Electron 28
IA:         Gemini Ultra + Claude Sonnet + Kimi 2.5 + LLaVA local
Mémoire:    ChromaDB (vectoriel) + SQLite (structuré) + LanceDB
HID:        RobotJS + PyAutoGUI + uiohook-napi
Telegram:   Telegraf.js v4
Dashboard:  React 18 + Vite + Tailwind + Recharts
Process:    PM2 (auto-restart, monitoring)
```

---

## 🌐 Communauté — La Ruche Mondiale

LaRuche est **open source** et conçu pour être étendu par la communauté.

### Contribuer un Skill

```bash
# 1. Créer votre skill
laruche skill create "mon super skill"

# 2. Le tester
laruche-skill mon_super_skill --args '{"param": "value"}'

# 3. Partager sur le Hive
laruche hive push mon_super_skill
```

### Rejoindre la Ruche

- 💬 [Discussions](https://github.com/AMFbot-Gz/LaRuche/discussions)
- 🐛 [Issues](https://github.com/AMFbot-Gz/LaRuche/issues)
- 🔧 [Pull Requests](https://github.com/AMFbot-Gz/LaRuche/pulls)
- ⭐ Star le projet pour soutenir !

---

## 📋 Roadmap 30 Jours

| Sprint | Jours | Objectif | KPI |
|--------|-------|----------|-----|
| 🏗 S1 | 1-7 | Structure + OS-Control + Telegram | Curseur via Telegram < 2s |
| 🔗 S2 | 8-14 | Vision + Vault + Whisper + Rollback | Rollback testé + Whisper OK |
| 🧠 S3 | 15-21 | Kimi ×10 + HUD + Skill Factory | Génération skill Lua < 30s |
| 🚀 S4 | 22-30 | Dashboard + Bundle + M6P + Marketplace | Build Roblox E2E < 5 min |

---

## ⚖️ Éthique & Légal

LaRuche est une technologie RPA légale pour automatiser **vos propres machines**.

- HITL non-négociable pour toute action irréversible
- Scope limité à vos machines et comptes
- AES-256 pour les données sensibles
- Kill Switch universel disponible

---

<div align="center">

**🐝 LaRuche — Construite par des abeilles, pour des abeilles**

*"Une commande. Une cascade. Un résultat."*

[⭐ Star](https://github.com/AMFbot-Gz/LaRuche) · [🐛 Issues](https://github.com/AMFbot-Gz/LaRuche/issues) · [💬 Discussions](https://github.com/AMFbot-Gz/LaRuche/discussions)

</div>
