<div align="center">

# LaRuche

**Agent IA souverain pour Mac — local, gratuit, tes donnees chez toi**

[Installation](#installation) · [Architecture](#architecture) · [FAQ](#faq)

</div>

---

## Ce que c'est

LaRuche est un agent IA autonome qui tourne sur ton Mac et execute des taches complexes en langage naturel : controler ton ecran, organiser des fichiers, trier des emails, ou toute mission que tu lui decris via Telegram ou le dashboard web.

**100% local.** Tes donnees ne quittent pas ta machine. Zero abonnement requis.

---

## Ce dont tu as besoin

Avant d'installer, verifie que tu as :

| Prerequis | Version | Pourquoi |
|---|---|---|
| macOS | 12+ (Apple Silicon recommande) | Computer Use natif |
| Node.js | 20+ | Queen orchestrateur |
| Python | 3.11+ | 11 agents FastAPI |
| [Ollama](https://ollama.com) | Derniere | Modeles IA locaux |
| RAM | 8 GB min, 16 GB recommande | Modeles en RAM |
| Disque | 8 GB libres | Modeles Ollama |
| Bot Telegram | Token (gratuit via @BotFather) | Interface principale |

> **Temps d'installation : 20-30 min** (dont telechargement des modeles Ollama)

---

## Installation

```bash
# 1. Cloner
git clone https://github.com/AMFbot-Gz/LaRuche.git
cd LaRuche

# 2. Config
cp .env.example .env
# Editer .env : remplir TELEGRAM_BOT_TOKEN et ADMIN_TELEGRAM_ID

# 3. Modeles Ollama (5-15 min selon connexion)
ollama pull llama3.2:3b       # 2 GB — modele de base
ollama pull llava:7b           # 4.7 GB — vision (Computer Use)

# 4. Dependances
make setup

# 5. Lancer
make start
```

---

## Demarrage rapide

Une fois lance, ouvre Telegram et envoie un message a ton bot :

```
Prends un screenshot de mon ecran
Ouvre Safari et va sur github.com
Organise mes telechargements par type de fichier
Quel est mon usage disque ?
```

Dashboard web : `http://localhost:3001`

---

## Architecture

```
LaRuche
|-- Queen (Node.js :3000)         Orchestrateur central
|   |-- Telegram bot              Interface principale
|   |-- API REST + WebSocket      Dashboard temps reel
|   `-- Computer Use Loop         Controle macOS via vision IA
|
|-- 10 agents Python (:8001-:8011)
|   |-- orchestration :8001       Planification
|   |-- perception    :8002       Screenshots + OCR
|   |-- brain         :8003       Routeur LLM (Ollama)
|   |-- executor      :8004       Shell, souris, clavier
|   |-- evolution     :8005       Auto-generation de skills
|   |-- memory        :8006       Memoire semantique ChromaDB
|   |-- mcp-bridge    :8007       Protocole MCP
|   |-- discovery     :8008       Decouverte ressources
|   |-- knowledge     :8009       Base de connaissances
|   |-- goals         :8010       Objectifs autonomes
|   `-- voice         :8011       Whisper STT + TTS macOS
|
`-- Dashboard (Next.js :3001)     Interface web temps reel
```

---

## Mode local vs mode cloud

### Mode LOCAL (defaut) — Gratuit

```env
LARUCHE_MODE=local   # valeur par defaut
```

- Ollama local (llama3.2, llava, qwen...)
- Donnees sur ta machine uniquement
- Computer Use active (controle ecran)
- Aucun compte, aucun paiement

### Mode CLOUD — En developpement

```env
LARUCHE_MODE=cloud
ANTHROPIC_API_KEY=sk-ant-...
```

- Claude Sonnet (plus puissant)
- Auth Clerk + Stripe billing
- Computer Use desactive (securite)

> Le mode cloud n'est pas encore en production. Pour un agent puissant sur ta machine, utilise le mode local.

---

## Commandes

```bash
make start        # Lance Queen + agents + dashboard
make stop         # Arrete tout
make status       # Etat des services
make test         # Lance les tests (124 Jest + 430 pytest)
make logs         # Logs en direct
```

---

## FAQ

**Faut-il une cle Anthropic ?**
Non. LaRuche fonctionne 100% avec Ollama en mode local. La cle Anthropic est optionnelle (meilleure qualite pour Computer Use).

**Ca marche sur Intel Mac ?**
Oui, mais les modeles sont plus lents. Apple Silicon (M1/M2/M3) recommande.

**Ca marche sur Linux / Windows ?**
Partiellement. Les agents Python et la Queen fonctionnent. Computer Use est macOS-only.

**Ou sont mes donnees ?**
Localement dans `./data/` (SQLite) et `./agents/memory/data/` (ChromaDB). Jamais envoyees ailleurs.

---

## Tests

```
Jest (Node.js) : 124 tests
Pytest (Python) : 430 tests
```

```bash
make test
```

---

## Licence

MIT — Built by [Wiaam Hadara](https://github.com/AMFbot-Gz) & Clio (AI co-founder)
