<div align="center">

# 🐝 LaRuche

**Ghost Swarm Autonomous Agent**

*Telegram → IA Swarm → Action physique*

[![v3.2](https://img.shields.io/badge/version-3.2.0-F5A623?style=flat-square)](https://github.com/AMFbot-Gz/LaRuche/releases)
[![Node 20+](https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![MIT](https://img.shields.io/badge/license-MIT-7C3AED?style=flat-square)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-22%2F22-22C55E?style=flat-square)](test/smoke.js)

```
Telegram → GLM-4.6 (stratégie) → qwen3-coder (code) → llama3.2 ×10 (exécution) → Action
```

</div>

---

## Démarrage rapide — 3 étapes

### Étape 1 — Prérequis

| | Prérequis | Installation |
|--|-----------|-------------|
| Node.js 20+ | `node --version` | [nodejs.org](https://nodejs.org) |
| Python 3.9+ | `python3 --version` | [python.org](https://python.org) |
| Ollama | `ollama --version` | `curl -fsSL https://ollama.ai/install.sh \| sh` |
| Bot Telegram | Token de @BotFather | `/newbot` sur Telegram |

### Étape 2 — Installation one-click

```bash
git clone https://github.com/AMFbot-Gz/LaRuche.git
cd LaRuche
bash scripts/fast_install.sh
```

Ou pour vérifier les prérequis sans rien installer :
```bash
bash scripts/fast_install.sh --dry-run
```

### Étape 3 — Configuration

```bash
# Ouvrir .env et remplir les 2 champs obligatoires :
#   TELEGRAM_BOT_TOKEN=  (depuis @BotFather)
#   ADMIN_TELEGRAM_ID=   (depuis @userinfobot)
nano .env
```

### Lancer

```bash
laruche start           # Mode complet (queen + dashboard)
laruche start --headless  # Sans dashboard (VPS/serveur)
```

---

## Première mission — test live

1. Ouvre Telegram, envoie **`/start`** à ton bot
2. Tu reçois la liste des modèles actifs et les commandes disponibles
3. Envoie ce prompt :

```
liste les fichiers du projet LaRuche et dis-moi lequel est le plus gros
```

**Ce que tu observes :**
- Le bot décompose la mission (GLM-4.6)
- Exécute en parallèle (llama3.2)
- Répond avec le résultat en ~5s
- Le dashboard sur http://localhost:8080 affiche la mission en temps réel

---

## Commandes CLI

```bash
laruche doctor          # Diagnostic complet (Ollama, Telegram, ports)
laruche status          # État des processus PM2
laruche models          # Modèles Ollama actifs par rôle
laruche init            # Configuration interactive .env

laruche start           # Lancer l'essaim (queen + dashboard)
laruche start --headless  # Sans dashboard (VPS)
laruche start --full    # + HUD Electron (desktop)
laruche dev             # Mode développement (verbose, no PM2)

laruche agent devops "analyse les logs"    # Agent spécialisé
laruche agent builder "génère une API"
laruche session                            # Historique sessions

laruche skill list      # Skills disponibles
laruche skill create "mon skill"  # Créer un skill via IA
laruche hive            # Marketplace communauté

laruche logs            # Logs temps réel
laruche stop            # Arrêter l'essaim
laruche rollback        # Restaurer un snapshot
```

---

## Architecture

```
Telegram / CLI
     │
     ▼
src/queen_oss.js         ← Entry point principal
     ├── model_router.js  ← Auto-sélection modèles Ollama
     ├── agents/          ← Multi-agent loop (TypeScript)
     ├── llm/provider.ts  ← Ollama + Anthropic + OpenAI + Kimi
     └── tools/           ← Router → MCP servers
          │
          ▼
mcp_servers/             ← OS-control, terminal, vision, vault...
hud/                     ← Ghost-Monitor Electron (overlay)
dashboard/               ← LaRuche HQ (React :8080)
workspace/               ← Memory, skills, agents (éditable)
config/agents.yml        ← Providers + tools + agents config
```

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour le schéma complet.

---

## Modes de run

| Mode | Commande | Processus | RAM |
|------|---------|-----------|-----|
| Headless | `laruche start --headless` | queen + watcher | ~100MB |
| Balanced *(défaut)* | `laruche start` | + dashboard | ~300MB |
| Full desktop | `laruche start --full` | + HUD Electron | ~450MB |
| Dev | `laruche dev` | queen (live) | ~150MB |

---

## Modèles Ollama

LaRuche auto-détecte les modèles installés et les assigne par rôle :

```bash
laruche models         # Voir la configuration actuelle

# Changer un modèle
laruche models --set-role worker=llama3.2:3b

# Changer de profil de performance
# Dans .env:
LARUCHE_MODE=low       # Rapide, léger (1 modèle)
LARUCHE_MODE=balanced  # Équilibré (défaut)
LARUCHE_MODE=high      # Maximum (tous les modèles)
```

---

## Étendre LaRuche

- **Ajouter un MCP** → [CONTRIBUTING.md#1-add-a-mcp-server](CONTRIBUTING.md)
- **Ajouter un skill** → `workspace/skills/mon_skill/SKILL.md`
- **Ajouter un agent** → `config/agents.yml` + `workspace/agents/`
- **Changer de provider LLM** → `.env` + `ANTHROPIC_ENABLED=true`

---

## Communauté

- 💬 [Discussions](https://github.com/AMFbot-Gz/LaRuche/discussions)
- 🐛 [Issues](https://github.com/AMFbot-Gz/LaRuche/issues)
- 🔧 [CONTRIBUTING.md](CONTRIBUTING.md)

---

<div align="center">
<strong>🐝 LaRuche — Une commande. Un essaim. Un résultat.</strong>
</div>
