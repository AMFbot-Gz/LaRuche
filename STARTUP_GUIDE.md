# Chimera — Guide de démarrage (sans Docker)

Ce guide décrit comment démarrer Chimera en développement local, étape par étape.

---

## Prérequis

| Outil | Version minimale | Installation |
|-------|-----------------|-------------|
| Node.js | ≥ 20.0.0 | https://nodejs.org |
| pnpm | ≥ 9.0.0 | `npm install -g pnpm` |
| Python | ≥ 3.11 | https://python.org |
| uv | dernière | https://docs.astral.sh/uv/ |
| Ollama | optionnel | https://ollama.com (requis pour le mode local) |

Vérifier tous les prérequis en une commande :

```bash
make doctor
```

---

## 1. Cloner et installer les dépendances

```bash
git clone https://github.com/AMFbot-Gz/LaRuche.git chimera
cd chimera

# Dépendances Node.js (tous les workspaces pnpm)
pnpm install

# Dépendances Python (workspace uv)
uv sync
```

---

## 2. Configurer les variables d'environnement

```bash
# Copier le template et l'éditer
cp .env.example .env
```

**Variables obligatoires dans `.env` :**

```dotenv
# Sécurité — générer avec : openssl rand -hex 32
CHIMERA_SECRET=<votre_secret>
NODE_ENV=development

# LLM — choisir un mode :
# MODE 1 : Ollama local uniquement (gratuit, privé)
OLLAMA_HOST=http://localhost:11434
ROUTING_MODE=local_only

# MODE 2 : Hybride Ollama + Claude (recommandé)
ANTHROPIC_API_KEY=sk-ant-...
ROUTING_MODE=auto

# Mode Standalone (pas de Telegram requis)
STANDALONE_MODE=true
```

**Variables optionnelles pour le dashboard :**

Copier également `apps/dashboard/.env.local.example` en `apps/dashboard/.env.local` si vous utilisez Clerk (auth) :

```bash
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
```

---

## 3. (Optionnel) Démarrer Ollama avec les modèles

Si vous utilisez le mode local ou hybride, Ollama doit tourner avec au moins un modèle :

```bash
# Démarrer le serveur Ollama (en arrière-plan)
ollama serve &

# Télécharger les modèles de base (environ 2-5 Go)
ollama pull llama3.2:3b        # worker rapide (obligatoire mode local)
ollama pull qwen2.5-coder:32b  # code (optionnel mais recommandé)
ollama pull llava               # vision (optionnel)
```

---

## 4. Démarrer Chimera

### Option A — Tout en une commande (recommandé)

Lance la Queen Node.js + le Dashboard Next.js + les agents Python :

```bash
make dev
```

### Option B — Composants séparés (debug)

**Terminal 1 — Queen Node.js (port 3000) :**
```bash
pnpm --filter laruche-bot dev
# ou directement :
cd apps/queen && node src/queen_oss.js
```

**Terminal 2 — Dashboard Next.js (port 3000) :**
```bash
pnpm --filter @saas/closer-web dev
# ou directement :
cd apps/dashboard && pnpm dev
```

**Terminal 3 — Agents Python (ports 8001-8009) :**
```bash
make agents-up
# Pour voir les logs :
make logs-agents
```

### Option C — pnpm dev (Turborepo)

Lance tous les workspaces avec `dev` script en parallèle via Turborepo :

```bash
pnpm dev
```

---

## 5. Vérifier le démarrage

| Service | URL | Description |
|---------|-----|-------------|
| Queen API | http://localhost:3000 | API REST principale |
| Dashboard | http://localhost:3000 (Next.js) | Interface graphique |
| HUD WebSocket | ws://localhost:9001 | Temps réel (missions) |
| Dashboard WS | ws://localhost:9002 | Temps réel (dashboard) |
| Orchestration | http://localhost:8001/status | Agent Python 1 |
| Perception | http://localhost:8002/status | Agent Python 2 |
| Brain | http://localhost:8003/status | Agent Python 3 |
| Executor | http://localhost:8004/status | Agent Python 4 |
| Evolution | http://localhost:8005/status | Agent Python 5 |
| Memory | http://localhost:8006/status | Agent Python 6 |
| MCP Bridge | http://localhost:8007/status | Agent Python 7 |

Vérifier l'état global :
```bash
make status
```

---

## 6. Premier test — envoyer une mission

En mode Standalone (`STANDALONE_MODE=true`), l'API REST est disponible :

```bash
# Test de santé
curl http://localhost:3000/health

# Envoyer une mission
curl -X POST http://localhost:3000/mission \
  -H "Content-Type: application/json" \
  -d '{"command": "Liste les 3 meilleurs frameworks Python pour une API REST"}'
```

---

## Architecture des ports

```
Queen Node.js        :3000   — API REST + WebSocket Dashboard (:9002)
Dashboard Next.js    :3000   — Interface SaaS (port partagé en dev Turbo)
HUD WebSocket        :9001   — Push temps réel vers le HUD
Orchestration        :8001   — Coordination des agents Python
Perception           :8002   — OCR, screenshots, vision
Brain                :8003   — Routing LLM (Ollama / Claude)
Executor             :8004   — Exécution d'actions systèmes
Evolution            :8005   — Auto-amélioration des skills
Memory               :8006   — Mémoire épisodique (ChromaDB)
MCP Bridge           :8007   — Model Context Protocol
Discovery            :8008   — Découverte de services
Knowledge            :8009   — Base de connaissances
```

---

## Commandes Makefile utiles

```bash
make doctor         # Vérifie les prérequis
make dev            # Démarre tout (Queen + Dashboard + Agents)
make queen          # Queen uniquement
make agents-up      # Agents Python uniquement
make agents-down    # Arrête les agents Python
make agents-status  # État des agents Python
make logs           # Logs de la Queen
make logs-agents    # Logs des agents Python
make test           # Lance tous les tests (Node.js + Python)
make clean          # Nettoie les artéfacts de build
make status         # État global du système
```

---

## Dépannage courant

### "STANDALONE_MODE non activé et TELEGRAM_BOT_TOKEN manquant"
Ajouter `STANDALONE_MODE=true` dans `.env`.

### "Ollama inaccessible — mode dégradé activé"
Normal si Ollama n'est pas lancé. Démarrer avec `ollama serve` ou passer en `ROUTING_MODE=claude_only` avec une clé Anthropic.

### "Cannot find module"
Relancer `pnpm install` depuis la racine du monorepo.

### Port déjà utilisé (EADDRINUSE)
```bash
# Trouver et tuer le processus occupant le port (ex: 3000)
lsof -ti :3000 | xargs kill -9
```

### Agents Python qui ne démarrent pas
```bash
# Vérifier uv et les dépendances Python
uv sync
make agents-status
```

---

## Structure du monorepo

```
chimera/
├── apps/
│   ├── queen/          — Queen Node.js (API + WebSocket + Butterfly Loop)
│   ├── dashboard/      — Dashboard Next.js (interface SaaS)
│   ├── gateway/        — Gateway multi-canaux (WhatsApp, Discord, Slack)
│   └── ghost-daemon/   — Daemon Computer Use
├── packages/
│   ├── db/             — @chimera/db (Prisma singleton)
│   ├── marketplace/    — @chimera/marketplace (skills registry)
│   ├── runtime/        — @chimera/runtime (auto-deployment, lite/ultimate mode)
│   ├── ui-kit/         — @saas/ui-kit (composants React partagés)
│   └── common/         — @saas/common (utilitaires partagés)
├── agents/             — 9 agents Python (uv workspace)
├── skills/             — Skills installés (registry.json + installed/)
├── .env.example        — Template variables d'environnement
└── Makefile            — Commandes de développement
```
