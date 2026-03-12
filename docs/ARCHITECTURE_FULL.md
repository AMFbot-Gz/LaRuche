# LaRuche — Architecture Complète & Audit

> Produit par audit statique du repo (2026-03-12)  
> Référence de design : philosophie PicoClaw (skills fichiers, gateway locale sécurisée, DX propre)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Structure du repo](#2-structure-du-repo)
3. [Couches logicielles](#3-couches-logicielles)
4. [Pipeline de mission — diagramme de séquence](#4-pipeline-de-mission)
5. [Flux computer-use (intentPipeline)](#5-flux-computer-use)
6. [Composants détaillés](#6-composants-détaillés)
7. [Points faibles identifiés](#7-points-faibles-identifiés)
8. [Plan de travail phasé](#8-plan-de-travail-phasé)

---

## 1. Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ENTRÉES UTILISATEUR                         │
│  Telegram  │  CLI (bin/)  │  REST API (standalone)  │  HUD/Voice   │
└──────┬─────┴──────┬───────┴───────────┬─────────────┴──────┬───────┘
       │            │                   │                     │
       └────────────┴───────────────────┴─────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    src/queen_oss.js    │  Orchestrateur principal
                    │   (Butterfly Loop)     │  winston logs, WS HUD
                    └─────────┬─────────────┘
                              │
             ┌────────────────┴─────────────────┐
             │                                  │
   ┌─────────▼──────────┐            ┌──────────▼──────────┐
   │  butterflyLoop()   │            │ runIntentPipeline()  │
   │  (LLM-only, abs.)  │            │ (computer-use, MCP)  │
   │  plan→exec→synth   │            │  planner→steps→MCP   │
   └─────────┬──────────┘            └──────────┬──────────┘
             │                                  │
   ┌─────────▼──────────┐            ┌──────────▼──────────┐
   │  model_router.js   │            │  src/agents/         │
   │  autoDetectRoles() │◄───────────│  planner.js          │
   │  ask() / stream()  │            │  intentPipeline.js   │
   └─────────┬──────────┘            └──────────┬──────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            │
                ┌───────────▼───────────┐
                │   Ollama (local)      │
                │  GLM-4.6 / Qwen3 /   │
                │  LLaMA 3.2 / LLaVA   │
                └───────────────────────┘
                            .
                            . (via execa JSON-RPC stdio)
                ┌───────────▼───────────┐
                │   MCP Servers (9)     │
                │  os_control, terminal │
                │  playwright, vault    │
                │  vision, rollback...  │
                └───────────────────────┘
```

**Note** : `agentLoop.ts` (PicoClaw-inspired) + `provider.ts` + `toolRouter.ts` existent mais sont **déconnectés** du flux principal. Accès uniquement via `agentBridge.js`.

---

## 2. Structure du repo

```
LaRuche/
├── bin/                    # CLI laruche, laruche-skill-runner
├── config/
│   ├── agents.yml          # Config YAML de tous les agents (hitl, providers, tools)
│   └── gpu-policy.yaml     # ⚠️ Créé (PR #4) mais non câblé
├── dashboard/              # React 18 + Vite (port 3000)
├── docs/                   # Documentation
├── hud/                    # Electron 28 (port 9001 WS)
├── mcp_servers/            # 9 serveurs JSON-RPC stdio
│   ├── browser_mcp.js      # AppleScript + osascript
│   ├── janitor_mcp.js      # Purge/rotation via janitor.js
│   ├── os_control_mcp.js   # RobotJS HID + screenshot (jimp, PR #1)
│   ├── playwright_mcp.js   # Chromium automation
│   ├── rollback_mcp.js     # Snapshot/restore fichiers
│   ├── skill_factory_mcp.js# Génération skills via LLM
│   ├── terminal_mcp.js     # Exec commandes (sandboxé)
│   ├── vault_mcp.js        # ChromaDB mémoire vectorielle
│   └── vision_mcp.js       # Appel src/vision.py
├── scripts/                # fast_install, skill-manager, etc.
├── skills/                 # Dossiers SKILL.md (PR #4 — branche)
├── src/
│   ├── agents/
│   │   ├── agentLoop.ts    # Loop TS PicoClaw-like (⚠️ déconnecté main)
│   │   ├── agentBridge.js  # Bridge JS→TS
│   │   ├── intentPipeline.js # Pipeline computer-use
│   │   └── planner.js      # Planner JSON (v3 PR #5)
│   ├── api/
│   │   └── missions.js     # CRUD missions (Hono.js)
│   ├── llm/
│   │   └── provider.ts     # LLMProvider (Ollama only main, fallback PR #3)
│   ├── modes/
│   │   └── standalone.js   # Mode REST HTTP
│   ├── skills/             # skillLoader.js (PR #5 — branche)
│   ├── tools/
│   │   └── toolRouter.ts   # ToolRouter (⚠️ TOOL_MAP partiel)
│   ├── utils/
│   │   └── yaml.ts         # Parser YAML minimal
│   ├── config.js           # Lecture config unifiée
│   ├── db.js               # sql.js SQLite wrapper
│   ├── janitor.js          # ⚠️ Bug: require() en ESM + better-sqlite3 manquant
│   ├── memory_store.js     # ChromaDB + MEMORY.md
│   ├── model_router.js     # Routeur Ollama (autoDetectRoles, ask, stream)
│   ├── queen.js            # ⚠️ Orchestrateur ancien (doublon ?)
│   ├── queen_oss.js        # Orchestrateur principal v3.2
│   ├── skill_evolution.js  # Ancien système skills (utilisé par smoke tests)
│   └── vision.py           # Vision Ollama (Python 3.11)
├── test/
│   ├── e2e/                # ⚠️ Vide (dir existe, aucun test)
│   └── smoke.js            # 22 smoke tests
├── vault/                  # ChromaDB data
├── workspace/
│   ├── memory/MEMORY.md    # Mémoire longue durée
│   └── skills/             # Skills utilisateur (priorité max)
├── .env.example
├── ecosystem.config.js     # PM2
└── package.json            # Node 20 ESM, v4.0.0
```

---

## 3. Couches logicielles

| Couche | Fichiers clés | Rôle | Qualité actuelle |
|---|---|---|---|
| **Entrées** | queen_oss.js (Telegram/CLI/HUD/WS) | Recevoir messages, auth admin, router | ⚠️ Mono-canal (Telegram only), pas d'abstraction |
| **Orchestrateur** | queen_oss.js (butterflyLoop) | Orchestration LLM multi-agents | ⚠️ Pas de struct Mission, tâches parallèles sans dépendances |
| **Pipeline computer-use** | planner.js, intentPipeline.js | Plan JSON → exécution MCP étape par étape | ✅ Bien structuré, vision loop, auto-correct |
| **Agent Loop TS** | agentLoop.ts, agentBridge.js | Loop itérative avec tool calls | ⚠️ Déconnecté du main flow |
| **LLM Router** | model_router.js | Routing vers modèles Ollama | ✅ Cache, findBest, streaming |
| **LLM Provider** | llm/provider.ts | Interface LLM provider-agnostic | ⚠️ Ollama only (main), fallback en PR non mergé |
| **MCP** | mcp_servers/*.js | Outils HID/terminal/vision/vault | ✅ Pattern JSON-RPC stdio cohérent |
| **Skills** | skill_evolution.js + skillLoader.js | Catalogue de skills | ⚠️ Deux systèmes parallèles, skillLoader non mergé |
| **Mémoire** | memory_store.js, vault_mcp.js, missions.js | Persistance expériences | ⚠️ 3 backends fragmentés, pas de source unique |
| **Config** | .env + config/agents.yml + .laruche/config.json | Configuration runtime | ⚠️ Trois sources, logique de merge absente |
| **Sécurité** | terminal_mcp.js (sandbox), agentLoop.ts (HITL) | Contrôle d'accès outils | ⚠️ HITL non actif dans main flow (en PR #2) |
| **Observabilité** | winston (queen_oss.js, janitor.js) | Logs | ⚠️ Non unifié, pas de corrélation ID |
| **Tests** | test/smoke.js | Validation de base | ⚠️ Pas d'unit tests, E2E vide |
| **HUD** | hud/, WS port 9001 | Interface temps réel | ⚠️ Pas d'auth WS |

---

## 4. Pipeline de mission

### 4a. Flux Telegram → butterflyLoop (texte abstrait)

```
Utilisateur
    │  Message Telegram
    ▼
queen_oss.js — bot.on("text")
    │  isComputerUseIntent(text) → false
    ▼
butterflyLoop(text, replyFn)
    │
    ├─ 1. Stratège (ask → planPrompt)
    │     model: glm-4.6 / llama3.2
    │     output: { mission, tasks: [{id, description, role}] }
    │
    ├─ 2. Exécution PARALLÈLE (Promise.all)
    │     Pour chaque task:
    │       ask(task.description, { role: task.role })
    │       → résultat texte
    │
    └─ 3. Synthèse (ask → synthPrompt)
          model: glm-4.6 / llama3.2
          output: réponse finale
          → saveMission(), broadcastHUD()
          → storeMissionMemory() (ChromaDB + MEMORY.md)
```

### 4b. Flux Telegram → runIntentPipeline (computer-use)

```
Utilisateur
    │  Message Telegram ("ouvre safari et cherche...")
    ▼
queen_oss.js — bot.on("text")
    │  isComputerUseIntent(text) → true (regex patterns)
    ▼
runIntentPipeline(text, { hudFn, onPlanReady, onStepDone })
    │
    ├─ plan(intent)
    │     planner.js: getRelevantSkills(intent,15) → buildPlannerPrompt
    │     ask(prompt, { role: "strategist" })
    │     → JSON: { goal, confidence, steps: [{skill, params}] }
    │
    ├─ pw.launch (Playwright si usePlaywright=true)
    │
    └─ Pour chaque step (séquentiel):
          executeStep(step, hudFn, useVision)
            │
            ├─ loadSkillHandlers() → index.js du skill si présent
            ├─ BUILTIN_HANDLERS[skill] sinon
            ├─ callMCP(serverFile, toolName, args)
            │     execa("node", [mcp_server], { input: JSON-RPC })
            │
            ├─ [si useVision] visionValidate(question)
            │     execa("python3", ["src/vision.py"])
            │
            └─ [si échec] tryAutoCorrect() → LLM correction → retry
```

### 4c. Flux CLI

```
bin/laruche.js <command>
    │  doctor / status / models / mission / skill
    ▼
  Direct calls: model_router.js, skill_evolution.js
  Mission: butterflyLoop() (pas runIntentPipeline)
```

### 4d. Flux Standalone REST

```
POST /api/mission { command }
    ▼
src/modes/standalone.js
    ▼
runMission(command, missionId)
    ▼
butterflyLoop(command, async()=>{}, missionId)
    │  updates via src/api/missions.js
    ▼
GET /api/missions/:id — polling pour résultat
```

---

## 5. Flux computer-use — détail MCP

```
intentPipeline.executeStep(step)
    │
    ▼  callMCP(serverFile, toolName, args)
    │
    │  JSON-RPC over stdio:
    │  { jsonrpc:"2.0", method:"tools/call", params:{name, arguments} }
    │
    ▼  execa("node", ["mcp_servers/X.js"], { input: rpcRequest })
    │
    ┌─────────────────────────────────────────────────────┐
    │  MCP Server (processus Node enfant)                  │
    │  stdin → parse JSON-RPC                              │
    │  → execute tool (RobotJS / Playwright / execa...)    │
    │  → stdout: { result: { content: [{text: JSON}] } }   │
    └─────────────────────────────────────────────────────┘
    │
    ▼  parse stdout → return result
```

**Pattern retry** : 3 tentatives avec timeout × attempt (backoff linéaire)

---

## 6. Composants détaillés

### 6.1 model_router.js

- **autoDetectRoles()** : détecte glm-4.6 → qwen3-coder → llama3.2:3b → llava selon disponibilité Ollama (cache 60s)
- **ask(prompt, opts)** : appel `/api/generate`, AbortSignal timeout
- **stream(prompt, opts)** : generator `/api/generate?stream=true`
- **route(task)** : regex-based routing (code/vision/stratégie/default)
- ⚠️ **Pas de retry** : un échec = `{ success:false, error }`
- ⚠️ **Pas de corrélation ID** dans les logs

### 6.2 src/agents/agentLoop.ts

- Loop itérative `while (iterations < max_iterations)` avec tool calls
- HITL threshold défini dans AgentConfig mais **non évalué** (PR #2 non mergé)
- Charge config depuis `configuration/agents/` (**chemin incorrect**, devrait être `config/agents/`)
- LLMProvider (provider.ts) : Ollama only (main), fallback chain en PR #3
- ToolRouter : TOOL_MAP partiel (5 outils vs 23+ builtin skills)
- **Déconnecté** : queen_oss.js ne l'appelle jamais directement

### 6.3 MCP Servers

| Serveur | Outils principaux | Notes |
|---|---|---|
| `os_control_mcp.js` | click, typeText, screenshot (jimp PNG — PR #1), mouseMove | RobotJS natif |
| `terminal_mcp.js` | execSafe (sandbox), exec | PathValidator, timeout 30s |
| `playwright_mcp.js` | pw.launch, pw.goto, pw.click, pw.fill, pw.screenshot | Chromium local |
| `browser_mcp.js` | os.openApp, os.focusApp, browser.goto (AppleScript) | macOS only |
| `vault_mcp.js` | storeExperience, searchMemory, storeProfile | ChromaDB |
| `vision_mcp.js` | analyzeScreen | Appel vision.py (LLaVA) |
| `rollback_mcp.js` | snapshot, restore | Copie de fichiers |
| `skill_factory_mcp.js` | generateSkill | LLM → skill JS |
| `janitor_mcp.js` | purgeTemp, rotateLogs | Appel janitor.js |

### 6.4 Mémoire (3 systèmes fragmentés)

```
Mémoire court terme  →  .laruche/missions.json     (200 missions max)
Mémoire vectorielle  →  vault/ (ChromaDB)          (via vault_mcp.js)
Mémoire longue durée →  workspace/memory/MEMORY.md  (texte YAML-blocks)
```

Aucune couche d'abstraction unifiée. Chaque appelant accède directement.

### 6.5 Configuration (3 sources)

```
.env                     → tokens, ports, flags (ANTHROPIC_ENABLED, etc.)
config/agents.yml        → agents, providers, tools, hitl_threshold
.laruche/config.json     → modèles Ollama (override model_router.js)
```

Pas de système de merge/validation centralisé. `src/config.js` existe mais chaque module charge ce dont il a besoin indépendamment.

---

## 7. Points faibles identifiés

### 🔴 CRITIQUE

| # | Problème | Fichier | Impact |
|---|---|---|---|
| C1 | **Double orchestrateur** : `queen.js` ET `queen_oss.js` — lequel est canonique ? | `src/queen.js`, `src/queen_oss.js` | Confusion DX, risque de divergence |
| C2 | **Bug ESM/CommonJS** : `janitor.js` utilise `require()` dans un module ESM (`"type":"module"`) | `src/janitor.js:67` | `ReferenceError: require is not defined` au runtime |
| C3 | **Dépendance manquante** : `janitor.js` importe `better-sqlite3` mais `package.json` n'a que `sql.js` | `src/janitor.js`, `package.json` | Crash au démarrage du janitor |
| C4 | **HITL inactif** : `hitl_threshold` défini dans AgentConfig mais jamais évalué dans le main flow | `src/agents/agentLoop.ts` | Sécurité non effective |
| C5 | **agentLoop.ts déconnecté** : pipeline TS complet (provider + toolRouter + loop) jamais appelé par queen_oss.js | `src/agents/agentLoop.ts` | Travail mort, incohérence |

### 🟠 IMPORTANT

| # | Problème | Fichier | Impact |
|---|---|---|---|
| W1 | **Pas de struct Mission** : butterflyLoop reçoit/retourne des strings, pas d'objet structuré avec id/status/steps | `src/queen_oss.js` | Debugging difficile, pas de vrai state machine |
| W2 | **Pas de corrélation ID** dans les appels MCP/LLM | tous les fichiers | Impossible de tracer un appel end-to-end dans les logs |
| W3 | **Tâches butterflyLoop en parallèle** sans gestion de dépendances | `src/queen_oss.js:butterflyLoop` | Résultats incohérents si tâche 2 dépend de tâche 1 |
| W4 | **provider.ts Ollama-only** (main branch) | `src/llm/provider.ts` | Fallback chain en PR #3 non mergé |
| W5 | **gpu-policy.yaml non câblé** dans model_router.js | `config/gpu-policy.yaml` | Politique GPU ignorée |
| W6 | **Deux systèmes skills** : `skill_evolution.js` (ancien) + `skillLoader.js` (PR #5) | doublon | Incohérence, smoke tests utilisent l'ancien |
| W7 | **ToolRouter TOOL_MAP partiel** : 5 outils mappés vs 23+ builtin skills | `src/tools/toolRouter.ts` | agentLoop.ts ne peut appeler que 5 tools |
| W8 | **isComputerUseIntent fragile** : 40+ regex, beaucoup de faux positifs potentiels | `src/agents/planner.js` | Mauvais routing text→pipeline |
| W9 | **HUD WebSocket sans auth** : port 9001, tout client localhost peut se connecter | `src/queen_oss.js:wss` | Risque exposition données missions |
| W10 | **Chemin config agentLoop incorrect** : `configuration/agents/` → devrait être `config/agents/` | `src/agents/agentLoop.ts:65` | Crash à chaque invocation agentLoop |

### 🟡 AMÉLIORATION

| # | Problème | Fichier | Impact |
|---|---|---|---|
| I1 | **Logs non unifiés** : winston dans queen/janitor, `console.warn/log` ailleurs | partout | Logs incomplets, format inconsistant |
| I2 | **Tests E2E vides** : `test/e2e/` existe mais aucun test | `test/e2e/` | Pas de filet de sécurité pour les refactors |
| I3 | **Mémoire fragmentée** : 3 backends sans abstraction | memory_store, vault, missions | Duplication, pas de recherche unifiée |
| I4 | **model_router.ask() sans retry** : un timeout = échec définitif | `src/model_router.js` | Instabilité Ollama → mission échouée |
| I5 | **butterflyLoop sans timeout global** : une tâche bloquante bloque tout | `src/queen_oss.js` | Mission zombie possible |
| I6 | **Vision overused** : visionValidate() après chaque step | `src/agents/intentPipeline.js` | Consommation GPU excessive, latence |
| I7 | **Pas de health endpoint** en mode standalone | `src/modes/standalone.js` | Monitoring impossible sans `/health` |
| I8 | **skill_factory_mcp.js minimal** : génère skill.js brut sans SKILL.md ni manifest | `mcp_servers/skill_factory_mcp.js` | Skills créés incompatibles avec nouveau format |

---

## 8. Plan de travail phasé

Voir `docs/PLAN_PHASÉ.md` pour le plan complet avec diffs et impacts.

### Résumé des 8 phases

```
Phase 1  ✅  Audit complet + ARCHITECTURE_FULL.md (ce document)
Phase 2  ✅  Système skills PicoClaw-like (PRs #4 + #5 — à merger)
Phase 3  →   Orchestrateur : struct Mission, merge queen.js, fix C1-C5
Phase 4  →   Gestion erreurs centralisée + corrélation IDs + logs JSON
Phase 5  →   Politique GPU : câbler gpu-policy.yaml dans model_router.js
Phase 6  →   Dashboard + HUD : audit vues, HITL modal, auth WS
Phase 7  →   Gateway multi-canaux : abstraction Channel, Discord/Slack
Phase 8  →   Tests E2E + docs HOW_TO_WRITE_A_SKILL etc.
```

### Priorité recommandée

1. **C1-C5 (critiques)** : corriger avant tout autre développement
2. **Merger PRs #1-#5** : fixes et skills sont prêts
3. **Phase 3** : struct Mission + unification orchestrateur
4. **Phase 4** : corrélation IDs + logs centralisés
5. **Phase 5** : GPU policy (impact perf immédiat)
6. **Phases 6-8** : UX, multi-canal, tests
