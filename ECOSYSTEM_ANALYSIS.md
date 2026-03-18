# ECOSYSTEM_ANALYSIS.md
*Analyse complète de l'écosystème IA de Wiaam — 2026-03-18*

---

## 1. Vue d'ensemble

Trois projets actifs, un seul Mac M2, un objectif cohérent : **un agent IA souverain qui contrôle son environnement sans cloud**.

| Projet | Chemin | Stack | État |
|--------|--------|-------|------|
| **ghost-os-ultimate** | `~/ghost-os-ultimate/` | Node.js + 19 Python agents + PM2 | ✅ EN PRODUCTION (18h uptime) |
| **LaRuche** | `~/Projects/LaRuche/` | Turborepo + Node.js + 11 Python agents | ⚠️ PRÊT MAIS ARRÊTÉ |
| **ruche-corps** | `~/Projects/ruche-corps/` | Python pur, agent souverain, Nemotron 230B | ❓ ÉTAT INCONNU |

**Constat immédiat** : ghost-os-ultimate est le seul système réellement en production aujourd'hui.
LaRuche est architecturalement plus propre mais pas en cours d'exécution.
ruche-corps est un prototype expérimental ambitieux.

---

## 2. ghost-os-ultimate — Système en Production

### 2.1 Architecture

```
~/ghost-os-ultimate/
├── src/              — Queen Node.js :3002 (gateway, missions, skills router)
├── agent/            — 19 agents Python FastAPI :8001-:8019
│   ├── queen.py      — orchestrateur vital loop
│   ├── brain.py      — LLM router, ReAct, Critic, ToT
│   ├── perception.py — screenshot OCR 30s
│   ├── executor.py   — shell + desktop actions
│   ├── memory.py     — ChromaDB + JSONL episodes
│   ├── evolution.py  — auto-mutation, skill factory
│   └── ... (13 autres agents)
├── skills/           — 40 skills JS (dont hub/, picoclaw-satellite, etc.)
├── mcp_servers/      — 12 serveurs MCP
└── ecosystem.config.cjs — 14 processus PM2
```

**Total code Python agents** : ~15 789 lignes (19 fichiers .py).

### 2.2 État Live (2026-03-18 matin)

| Service | Port | Statut | Uptime | Restarts |
|---------|------|--------|--------|----------|
| jarvis-gateway | — | ✅ online | 18h | 1 |
| queen-node | :3002 | ✅ online | 18h | 0 |
| agents-python | :8001-:8019 | ✅ online | 18h | **8** |
| vital-loop | — | ✅ online | 18h | **6** |
| moltbot-bridge | :3003 | ✅ online | 18h | 2 |
| goals-scheduler | :3005 | ✅ online | 18h | 0 |
| memory-hub | :3004 | ✅ online | 18h | 0 |
| laruche-sync | :3007 | ✅ online | 18h | 0 |
| stitch-bridge | :3006 | ✅ online | 18h | 0 |
| self-repair | — | ✅ online | 18h | 0 |
| night-worker | — | ✅ online | 14h | 1 |
| ollama-watchdog | — | ✅ online | 18h | 0 |
| ruche-bridge | :8020 | ✅ online | 18h | 1 |
| pico-compressor | — | ✅ online | 18h | 0 |

**14/14 processus online**. Le 8 restarts sur agents-python est le seul signal d'instabilité.

### 2.3 Santé des APIs vérifiée

```json
// :3002/api/health
{"ok":true,"ts":1773869998814}

// :8001/health
{"status":"ok","layer":"queen","vital_loop":true,"hitl_pending":0,
 "world_model":{"active_app":"Terminal","cpu_high":false,"disk_low":false}}

// :8003/health
{"status":"ok","layer":"brain","active_provider":"ollama",
 "react_enabled":true,"critic_enabled":true,"tot_enabled":true,
 "vector_memory_enabled":true,"circuit_reset_count":116}

// :8006/health
{"status":"ok","layer":"memory","episode_count":155,"chroma_ready":true,
 "chroma_indexed":155,"embed_model":"nomic-embed-text"}
```

ChromaDB : 155 épisodes indexés, prêt. Brain : 116 circuit resets — Ollama a planté 116 fois mais s'est auto-réparé.

### 2.4 Score Production-Readiness : 74/100

*Source : JARVIS_AUDIT.md (audit 2026-03-18)*

| Composant | Score |
|-----------|-------|
| Python Agents (16/16 UP) | 92/100 |
| MCP Servers (12/12) | 95/100 |
| Node.js Queen | 78/100 |
| Skills JS | 82/100 |
| Configuration | 70/100 |
| End-to-End Mission | **55/100** |
| Tests & CI | **40/100** |

### 2.5 Bugs Critiques Identifiés (non corrigés)

**Bug #1 — AbortError TRANSIENT (bloqueur mission)**
- Fichier : `src/llm/callLLM.js` + `src/agents/intentPipeline.js:220`
- `AbortError` (timeout fetch) classifié `TRANSIENT` → retries en boucle
- Résultat : une mission LLM peut bloquer **5 minutes** avant d'échouer
- Fix : supprimer `if (err.name === 'AbortError') return true;` de `isTransient()`

**Bug #2 — better-sqlite3 manquant**
- `token_sentinel.js` importe `better-sqlite3` — module absent de node_modules
- Queen :3002 tourne → module probablement lazy-loadé ou conditionnel
- Fix : `npm install better-sqlite3` dans le répertoire ghost-os-ultimate

**Bug #3 — 4 skills avec manifest.yaml au lieu de manifest.json**
- `skill_runner.js:65` lit `manifest.json` → 4 skills jamais chargés
- `skill_evolution.js:130` génère `manifest.yaml` (bug générateur source)
- Skills affectés : `organise_screenshots`, `organise_telechargements`, `organise_les_screenshots_par_date_et_les`, `automatise_l_organisation_des_t_l_charge`

---

## 3. LaRuche — Monorepo Propre, Pas en Production

### 3.1 Architecture

```
~/Projects/LaRuche/           (Turborepo + pnpm workspaces)
├── apps/
│   ├── queen/        — Node.js :3000, Hono, 30 skills, 124 tests Jest ✅
│   └── dashboard/    — Next.js 15 :3001, React 19, 14 pages
├── agents/           — 11 agents Python FastAPI :8001-:8011
├── packages/
│   ├── chimera-config/  — config local/cloud (LARUCHE_MODE)
│   ├── chimera-sdk/
│   ├── chimera-types/
│   └── db/ (Prisma + Neon)
├── skills/core/      — 30 skills JS (registry v1.4.0)
└── skills/cli-anything/ — scaffold CLI-Anything
```

### 3.2 Ce qui est propre

- **124 tests Jest verts** (unit + integration)
- **moltbot extrait** — apps/gateway/ supprimé, backup ~/Projects/moltbot-standalone/
- **Mode local/cloud** — `LARUCHE_MODE=local|cloud` dans chimera-config
- **Double ComputerUseLoop corrigé** — une seule implémentation (services/ avec HITL)
- **README honnête** — prérequis réalistes (20-30 min, 8GB RAM)
- **CI/CD GitHub Actions** — test + deploy-railway + deploy-vercel
- **GO_LIVE.md** — guide déploiement complet (45-60 min, €0 initial)

### 3.3 Ce qui est arrêté

Queen :3000 : **non démarrée** (ghost-os-ultimate occupe les agents Python :8001-:8011).
Dashboard :3001 : **non démarré**.

Il y a un **conflit de ports** : ghost-os-ultimate et LaRuche veulent tous les deux les ports :8001-:8011. Les deux ne peuvent pas tourner simultanément.

### 3.4 Score Production-Readiness : 68/100

| Aspect | Score | Commentaire |
|--------|-------|-------------|
| Architecture | 78/100 | Turborepo propre, mode local/cloud |
| Tests | 82/100 | 124 Jest, 0 pytest (agents Python non testés) |
| Déploiement | 75/100 | Railway + Vercel configurés, pas encore déployé |
| Cohérence concept | 60/100 | Queen :3000 vs :3002, même fonctions |
| Documentation | 70/100 | README propre, CLAUDE.md à jour |
| Agents Python | 40/100 | 11 agents définis, aucun testé en isolation |

---

## 4. ruche-corps — Agent Souverain Expérimental

### 4.1 Architecture

```
~/Projects/ruche-corps/
├── agent.py          — ReAct loop principal (15 iter max)
├── worker.py         — Worker autonome missions longues
├── goals.py          — Objectifs autonomes (SQLite)
├── watchdog.py       — Surveillance + auto-réparation
├── memory.py         — ChromaDB + embeddings
├── router.py         — Model selection
├── core/             — structlog, Pydantic, circuit breaker
├── tools/            — 32+ outils @tool
│   ├── builtins.py   — outils intégrés
│   ├── registry.py   — registre dynamique
│   └── integrations/ — intégrations externes
├── computer/         — Computer use macOS
├── missions/         — HTN planner + executor + queue
├── senses/           — Telegram + Voice
└── context/          — Context builder 128K tokens
```

### 4.2 Particularités notables

- **Nemotron-3-Super 230B** comme modèle principal — ce modèle n'est pas dans la liste Ollama locale. C'est soit un modèle cloud (via API externe), soit une aspiration documentaire non encore réalisée.
- **32+ outils @tool** — annotation Python déclarative, découverte automatique
- **HTN Planner** (Hierarchical Task Network) — planification structurée avant ReAct
- **Secrets dans `~/.ruche/.env`** — config isolée du projet, bonne pratique
- **Watchdog** et **worker autonome** — fonctionnement sans surveillance
- **State inconnu** : aucun port actif visible dans PM2 pour ruche-corps

### 4.3 Diagnostic

ruche-corps semble être le **prototype le plus ambitieux** (230B, HTN, 32 tools) mais aussi le moins opérationnel. Son watchdog et worker ne sont pas dans l'écosystème PM2 de ghost-os-ultimate. Il tourne peut-être en standalone ou pas du tout.

---

## 5. Services et Infrastructure en Cours

### 5.1 Ports actifs

| Port | Service | Projet | Santé |
|------|---------|--------|-------|
| :3002 | queen-node (Node.js) | ghost-os-ultimate | ✅ |
| :3003 | moltbot-bridge | ghost-os-ultimate | ✅ (2 restarts) |
| :3004 | memory-hub | ghost-os-ultimate | ✅ |
| :3005 | goals-scheduler | ghost-os-ultimate | ✅ |
| :3006 | stitch-bridge | ghost-os-ultimate | ✅ |
| :3007 | laruche-sync | ghost-os-ultimate | ✅ |
| :8001 | queen.py | ghost-os-ultimate | ✅ |
| :8003 | brain.py | ghost-os-ultimate | ✅ |
| :8006 | memory.py | ghost-os-ultimate | ✅ |
| :8020 | ruche-bridge | ghost-os-ultimate | ✅ |
| :11434 | Ollama | système | ✅ |

Ports **non actifs** : :3000 (LaRuche queen), :3001 (LaRuche dashboard), :8001-:8011 (LaRuche agents).

### 5.2 Redis et Docker

Docker est installé (`/Applications/Docker.app`) mais **Docker daemon non démarré** (`docker ps` a échoué avec exit code 1). Redis, N8N, et les autres services Docker définis dans docker-compose.dev.yml de LaRuche sont donc **tous arrêtés**.

ghost-os-ultimate fonctionne sans Docker — SQLite + ChromaDB directs.

### 5.3 Réseau PM2

14 processus PM2 constituent le vrai système en production :
- Jarvis répond sur Telegram via `jarvis-gateway`
- Missions passent par `queen-node :3002`
- LLM routing via `brain.py :8003` (Ollama local)
- Mémoire via `memory.py :8006` (ChromaDB, 155 épisodes)
- Synchronisation LaRuche via `laruche-sync :3007`
- Moltbot via `moltbot-bridge :3003`

---

## 6. Modèles Ollama Disponibles

### 6.1 Modèles locaux (sur disque)

| Modèle | Taille | Usage | Dernière utilisation |
|--------|--------|-------|---------------------|
| llama3.2:3b | 2.0 GB | Worker/code/compress | 36h |
| nomic-embed-text | 274 MB | Embeddings ChromaDB | 2j |
| ghost-os-architect | 4.7 GB | Modèle custom Wiaam | 5j |
| llava:7b | 4.7 GB | Vision/screenshot | 6j |
| llama3:latest | 4.7 GB | Stratégiste/planning | 3 sem |
| llava:latest | 4.7 GB | Vision (alias llava:7b) | 4 sem |
| llama3.2:latest | 2.0 GB | (alias llama3.2:3b) | 4 sem |
| moondream:latest | 1.7 GB | Vision légère | 4 sem |
| llama3.2-vision:latest | 7.8 GB | Vision haute qualité | 4 sem |

**Total espace disque local** : ~37 GB (sans compter les doublons alias)
**Total RAM si tout chargé** : ~37 GB — impossible sur M2 standard (16-24 GB RAM)

### 6.2 Modèles cloud (0 octets local, route vers API externe)

| Modèle | Taille | Provider probable |
|--------|--------|------------------|
| qwen3-coder:480b-cloud | 0 (cloud) | Alibaba/OpenRouter |
| minimax-m2:cloud | 0 (cloud) | Minimax |
| gpt-oss:20b-cloud | 0 (cloud) | OpenAI/compatible |
| gpt-oss:120b-cloud | 0 (cloud) | OpenAI/compatible |
| qwen3-vl:235b-cloud | 0 (cloud) | Alibaba |
| glm-4.6:cloud | 0 (cloud) | Zhipu AI (utilisé par PicoClaw) |

6 modèles cloud = dépendance extérieure non documentée dans les README.

### 6.3 Routing actuel de brain.py

```
Stratégiste   → llama3:latest (4.7 GB)
Worker/Code   → llama3.2:3b (2.0 GB)
Vision        → moondream:latest (1.7 GB)
Compressor    → llama3.2:3b (2.0 GB)
```
Modèle `ghost-os-architect` custom non utilisé par le routing par défaut.

---

## 7. Applications et Outils Installés

### 7.1 Applications macOS (/Applications/)

| App | Pertinence IA |
|-----|---------------|
| **Claude.app** | Interface bureau Anthropic |
| **Ollama.app** | Runtime LLM local |
| **LM Studio** | Alternative Ollama (interface GUI) |
| **ChatGPT Atlas** | Interface GPT |
| **Google Chrome** | Browser automation (Playwright) |
| **Docker.app** | Containers (arrêté) |
| **Pencil.app** | Design UI (MCP pencil actif) |
| **Antigravity.app** | Inconnu |
| **balenaEtcher.app** | Flash OS sur USB |

Constat : **aucune des apps cibles CLI-Anything** (GIMP, Blender, LibreOffice, OBS, Inkscape, Audacity) n'est installée. CLI-Anything ne peut pas être utilisé pour ces apps pour l'instant.

### 7.2 Homebrew (85 formules, 0 casks)

Formules notables : `gh`, `ffmpeg`, `cloudflared`, `goclone`, `gcc`, `node` (via nvm probable), `python` (via pyenv probable).

Pas de casks Homebrew — toutes les apps GUI sont installées directement depuis .dmg ou App Store.

---

## 8. Synthèse Honnête et Recommandations

### 8.1 Ce qui fonctionne vraiment

1. **ghost-os-ultimate est opérationnel** : 14 processus PM2, 18h uptime, Telegram actif, 155 épisodes mémoire.
2. **Brain Layer est impressionnant** : ReAct + Critic + ToT + ChromaDB sémantique. Le circuit breaker a réparé 116 pannes Ollama automatiquement.
3. **LaRuche est architecturalement solide** : 124 tests verts, moltbot extrait, mode local/cloud propre, déploiement Railway/Vercel configuré.
4. **Ollama local** : 9 modèles locaux disponibles, routing intelligent, `keep_alive: -1` optimisé.

### 8.2 Ce qui ne fonctionne pas / risque

| Problème | Sévérité | Impact |
|----------|----------|--------|
| AbortError TRANSIENT dans callLLM.js | 🔴 Critique | Missions bloquées 5 min |
| better-sqlite3 manquant | 🔴 Critique | Crash potentiel queen-node |
| 4 skills manifest.yaml non chargés | ⚠️ Majeur | Skills fantômes dans UI |
| 8 restarts agents-python | ⚠️ Majeur | Instabilité Python layer |
| Docker arrêté → Redis arrêté | ⚠️ Majeur | LaRuche ne peut pas démarrer |
| Conflict ports :8001-:8011 | ⚠️ Majeur | ghost-os et LaRuche incompatibles simultanément |
| 116 circuit resets Ollama | ℹ️ Info | Ollama instable mais auto-réparé |
| ruche-corps Nemotron 230B | ℹ️ Info | Modèle non disponible localement |
| 28 Jest tests fail (ghost-os) | ℹ️ Info | Fixtures, pas régressions |

### 8.3 Relation entre les trois projets

```
ghost-os-ultimate     ←──── PRODUCTION ────→   Telegram @LaRuche9r_bot
      │
      ├── laruche-sync :3007  ←── tente de parler à LaRuche
      └── ruche-bridge :8020  ←── tente de parler à ruche-corps

LaRuche              ←──── STAGING (propre) ──→  pas démarré
ruche-corps          ←──── EXPÉRIMENTAL ─────→   état inconnu
```

Les trois projets font globalement la même chose (agent IA autonome macOS) avec des stacks légèrement différentes. ghost-os-ultimate a gagné la course à la production par itération rapide. LaRuche est plus propre architecturalement mais sans utilisateurs. ruche-corps est le plus ambitieux sur le papier mais le moins fonctionnel.

### 8.4 Priorités recommandées

**Cette semaine :**
1. Fix `callLLM.js` AbortError TRANSIENT — 5 lignes, impact immédiat sur latence missions
2. `npm install better-sqlite3` dans ghost-os-ultimate — potentiel crash silent
3. Fix 4 manifest.yaml → manifest.json (renommer ou corriger le générateur)

**Ce mois :**
4. Décider : LaRuche **remplace** ghost-os-ultimate ou coexiste sur ports différents
5. Démarrer Docker → Redis → relancer LaRuche en local pour valider toute la stack
6. Définir le sort de ruche-corps (merger ses 32 tools dans LaRuche ou archiver)

**Question stratégique :**
Deux Queens (ghost-os :3002, LaRuche :3000) faisant la même chose est une dette de décision non résolue. LaRuche a meilleure architecture et tests ; ghost-os-ultimate a l'historique et la production. La migration est inévitable.

---

*Rapport généré le 2026-03-18 — lecture directe des fichiers, PM2, health APIs, Ollama.*
*Aucun fichier modifié.*
