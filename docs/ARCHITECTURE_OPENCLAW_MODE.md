# LaRuche × OpenClaw — Audit Architecture & Plan d'Évolution

> Document produit par analyse automatisée du repo LaRuche et de la référence OpenClaw.  
> Objectif : transformer LaRuche en assistant personnel extensible par skills, multi-canaux, fiable et GPU-efficient.

---

## Table des matières

1. [Cartographie pipeline LaRuche](#1-cartographie-pipeline-laruche)
2. [Architecture OpenClaw](#2-architecture-openclaw)
3. [Comparaison structurée LaRuche vs OpenClaw](#3-comparaison-structurée-laruche-vs-openclaw)
4. [Gap Analysis](#4-gap-analysis)
5. [Phase B — Système de skills OpenClaw-like](#5-phase-b--système-de-skills-openclaw-like)
6. [Phase C — Gateway multi-canaux](#6-phase-c--gateway-multi-canaux)
7. [Phase D — Fiabilité et logs](#7-phase-d--fiabilité-et-logs)
8. [Phase E — Politique GPU](#8-phase-e--politique-gpu)
9. [Phase F — Roadmap](#9-phase-f--roadmap)

---

## 1. Cartographie pipeline LaRuche

### 1.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────┐
│                        ENTRÉES                                   │
│  Telegram Bot     REST API       CLI (bin/)    HUD WebSocket     │
│  /mission cmd     POST /api/     laruche cmd   Electron overlay  │
│  texte libre      mission        start/status  port 9001         │
└──────────────┬───────────────────┬─────────────────┬────────────┘
               │                   │                 │
               ▼                   ▼                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                  src/queen_oss.js (Orchestrateur)                │
│                                                                  │
│  MODE TELEGRAM                    MODE STANDALONE                │
│  intentPipeline.js                modes/standalone.js            │
│  (computer-use intent?)           (REST API Hono)                │
│         │                                 │                      │
│         ▼                                 ▼                      │
│    butterflyLoop()  ◄─────────────────────┘                     │
│    (cœur IA)                                                     │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│               BUTTERFLY LOOP (src/queen_oss.js)                  │
│                                                                  │
│  1. Stratège (glm-4.6) — décompose en sous-tâches JSON          │
│  2. Workers parallèles (llama3.2:3b) — exécutent chaque tâche   │
│  3. Synthèse (model_router.ask) — consolide les résultats        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────┐        │
│  │  model_router.js                                    │        │
│  │  autoDetectRoles() → route() → ask()                │        │
│  │  Ollama local: glm-4.6 | qwen3 | llama3.2 | llava   │        │
│  └─────────────────────────────────────────────────────┘        │
└──────────────┬───────────────────────────────────────────────────┘
               │ (si computer-use intent)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│           INTENT PIPELINE (src/agents/intentPipeline.js)         │
│                                                                  │
│  1. planner.js → plan JSON {goal, confidence, steps[]}          │
│  2. executeStep() × chaque step                                  │
│  3. visionValidate() entre chaque step (si vision activé)       │
│  4. tryAutoCorrect() si step échoue                             │
│                                                                  │
│  Dispatch par type de step:                                      │
│    → Skill dynamique (workspace/skills/*/index.js)              │
│    → Handler builtin (open_safari, click_element, etc.)         │
│    → callMCP(serverFile, toolName, args) — retry x3             │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   MCP SERVERS (mcp_servers/)                     │
│                                                                  │
│  os_control_mcp.js    → moveMouse, click, typeText, scroll       │
│  terminal_mcp.js      → exec, execSafe, listProcesses            │
│  vision_mcp.js        → analyzeScreen, findElement               │
│  browser_mcp.js       → os.openApp, browser.goto, pressEnter    │
│  playwright_mcp.js    → pw.launch, pw.goto, pw.click, pw.fill    │
│  vault_mcp.js         → storeExperience, findSimilar, getProfile │
│  skill_factory_mcp.js → createSkill, evolveSkill, listSkills     │
│  rollback_mcp.js      → createSnapshot, restore                  │
│  janitor_mcp.js       → purgeTemp, rotateLogs, gcRAM             │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                   SORTIES                                        │
│  Telegram reply    REST JSON    HUD broadcast    logs/winston    │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Rôles des modules agents

| Module | Rôle | Chemin |
|--------|------|--------|
| **queen_oss.js** | Orchestrateur central. Initialise Telegram/API, gère les missions (butterflyLoop), broadcast HUD, persiste .laruche/missions.json | `src/queen_oss.js` |
| **butterflyLoop** | Fonction principale IA : stratège → workers parallèles → synthèse. Appelle model_router.js | dans queen_oss.js |
| **intentPipeline.js** | Pipeline computer-use : détecte si l'intent nécessite du contrôle OS, planifie les steps, les exécute avec vision validation | `src/agents/intentPipeline.js` |
| **planner.js** | Transforme une intention naturelle en plan JSON structuré (1 seul appel LLM). Charge les skills depuis workspace/ | `src/agents/planner.js` |
| **agentBridge.js** | Bridge JS → TypeScript agentLoop. Graceful fallback si TypeScript non compilé | `src/agents/agentBridge.js` |
| **agentLoop.ts** | Boucle agent TypeScript complète (intake → LLM → tool calls → memory). Supporte HITL, thought_chain, retry | `src/agents/agentLoop.ts` |
| **model_router.js** | Auto-détection des modèles Ollama par rôle, routing par mots-clés, cache | `src/model_router.js` |
| **toolRouter.ts** | Dispatch des tool calls vers MCP (à implémenter complètement) | `src/tools/toolRouter.ts` |

---

## 2. Architecture OpenClaw

### 2.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│                  CANAUX (25+)                                        │
│  WhatsApp · Telegram · Slack · Discord · Signal · iMessage           │
│  IRC · Matrix · Teams · Feishu · LINE · Mattermost · Nextcloud       │
│  WebChat · macOS app · iOS app · Android app · CLI · TUI             │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ WebSocket (port 18789)
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    GATEWAY (src/gateway/)                            │
│  Sessions · Routing · Auth · Allowlist · Model overrides             │
│  Thread bindings · Mention/Command gating · Inbound debounce         │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                 AGENT RUNTIME (src/agents/)                          │
│                                                                      │
│  Context Engine ──► LLM Provider ──► Tools/Skills ──► Memory        │
│  (compaction,        (OpenAI/Anthropic/  (55+ skills,    (SQLite      │
│   résumés)            Gemini/local)       plugin tools)   per agent)  │
└────────────────────────┬─────────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
┌─────────────────────┐  ┌──────────────────────────────────────────┐
│   SKILLS (55+)      │  │   PLUGIN SYSTEM                          │
│   skills/*/SKILL.md │  │   Slots: Channel · Memory · Tool         │
│   Sélection par     │  │       · Provider                         │
│   pertinence        │  │   Hooks: before-agent-start,             │
│   (injection        │  │         after-tool-call, message…        │
│    sélective)       │  │   ClawHub: registry en ligne (5400+)     │
└─────────────────────┘  └──────────────────────────────────────────┘
```

---

## 3. Comparaison structurée LaRuche vs OpenClaw

### 3.1 Gestion des skills

| Critère | LaRuche | OpenClaw | Écart |
|---------|---------|----------|-------|
| Format skill | JS + SKILL.md optionnel (chargé mais non utilisé structurellement) | Dossier `skills/*/SKILL.md` (spec riche, injection sélective) | **Majeur** |
| Catalogue builtins | 24 skills hardcodés dans planner.js | 55+ skills SKILL.md | **Majeur** |
| Skills workspace | `workspace/skills/*/index.js` (JS exécutable) | `workspace/skills/*/SKILL.md` (instructions LLM) | **Moyen** |
| Priorité de chargement | workspace > builtin (partiel) | workspace > global > bundled | **Mineur** |
| Registry en ligne | Absent | ClawHub (5400+ skills) | **Majeur** |
| Install/uninstall | `laruche skill create` (génération par IA) | `clawhub install <skill>` + plugin lifecycle | **Majeur** |
| Injection dans prompt | Catalogue complet injecté | Sélection par pertinence (anti-inflation) | **Moyen** |

### 3.2 Canaux de messagerie

| Critère | LaRuche | OpenClaw | Écart |
|---------|---------|----------|-------|
| Telegram | ✅ Natif (Telegraf.js) | ✅ Plugin | — |
| REST API | ✅ Hono + standalone mode | ✅ WebChat | — |
| Discord | ❌ | ✅ | **Majeur** |
| Slack | ❌ | ✅ | **Majeur** |
| WhatsApp | ❌ | ✅ | **Majeur** |
| Signal | ❌ | ✅ | **Majeur** |
| iMessage | ❌ | ✅ (via BlueBubbles) | **Majeur** |
| CLI | ✅ `laruche` binary | ✅ `openclaw` CLI | — |
| HUD Electron | ✅ Electron overlay | ✅ macOS/iOS/Android apps | Mineur |
| Normalisation | ❌ Couplé Telegram | ✅ Gateway unifié | **Majeur** |

### 3.3 Mémoire / Workspace / Vault

| Critère | LaRuche | OpenClaw | Écart |
|---------|---------|----------|-------|
| Stockage persistant | ChromaDB (vector) + SQLite (sql.js) | SQLite per agent | Mineur |
| Profil utilisateur | `.laruche/patron-profile.json` | Memory SQLite + AGENTS.md | Mineur |
| Recherche vectorielle | ChromaDB (vault_mcp) | Memory search (configurable) | Mineur |
| Mémoire par agent | Partagée | ✅ Isolée par agent | **Moyen** |
| Context compaction | ❌ Absent | ✅ Context engine + compaction | **Majeur** |
| Persistance sessions | `.laruche/missions.json` | Sessions SQLite | Mineur |

### 3.4 Intégrations externes

| Critère | LaRuche | OpenClaw | Écart |
|---------|---------|----------|-------|
| OS Control | ✅ MCP (HID, terminal, vision) | ✅ Via skills système | — |
| Navigateur | ✅ Playwright MCP | ✅ Via skills browser | — |
| IoT / Smart home | ❌ | ✅ Philips Hue, Sonos, Spotify | **Majeur** |
| Productivité SaaS | ❌ | ✅ Notion, Trello, Bear, Things | **Majeur** |
| GitHub | ❌ | ✅ github skill | **Moyen** |
| Email | ❌ | ✅ himalaya skill | **Moyen** |
| Canvas / UI riche | ❌ | ✅ Canvas host (HTML WebView) | **Moyen** |
| Plugin tiers | ❌ | ✅ Plugin SDK + ClawHub | **Majeur** |

---

## 4. Gap Analysis

### Gaps critiques (bloquants pour l'UX OpenClaw-like)

```
┌─────────────────────────────────────────────────────────────────────┐
│  GAP 1 — SYSTÈME DE SKILLS NON STRUCTURÉ                           │
│  Impact: Skills ne sont pas des artefacts versionnés, installables, │
│  éditables sans toucher au code. L'utilisateur ne peut pas créer   │
│  un skill avec juste un SKILL.md.                                  │
│  Solution: Format SKILL.md + manifest.yaml + skillLoader.ts         │
├─────────────────────────────────────────────────────────────────────┤
│  GAP 2 — CANAL UNIQUE (TELEGRAM)                                   │
│  Impact: Pas d'utilisation depuis Discord/Slack/WhatsApp.           │
│  Solution: Abstraction Gateway + adaptateurs de canaux              │
├─────────────────────────────────────────────────────────────────────┤
│  GAP 3 — PAS DE CONTEXT ENGINE                                     │
│  Impact: En session longue, le contexte grossit sans contrôle.     │
│  Solution: Compaction + résumé glissant + injection sélective       │
├─────────────────────────────────────────────────────────────────────┤
│  GAP 4 — PAS DE PLUGIN SYSTEM                                      │
│  Impact: Impossible d'ajouter un canal, un provider LLM,           │
│  ou un backend mémoire sans modifier le code core.                 │
│  Solution: Slots (Channel · Tool · Provider · Memory)              │
├─────────────────────────────────────────────────────────────────────┤
│  GAP 5 — POLITIQUE GPU ABSENTE                                     │
│  Impact: Gros modèles utilisés pour des tâches triviales.          │
│  Solution: Matrice task-class → model, contrôle via config         │
└─────────────────────────────────────────────────────────────────────┘
```

### Gaps importants (UX dégradée)

- **Pas d'injection sélective des skills** : le catalogue complet est envoyé au LLM → tokens gaspillés
- **Pas de registry de skills** : pas de versioning, pas d'install/uninstall propre
- **Mémoire non isolée par agent** : tous les agents partagent le même vault
- **Pas de compaction de contexte** : sessions longues = dérive des modèles
- **TypeScript non compilé par défaut** : agentBridge.js utilise un fallback JS stub

---

## 5. Phase B — Système de skills OpenClaw-like

### 5.1 Structure d'un skill

```
skills/
  <nom-du-skill>/
    SKILL.md          # (requis) Instructions LLM + métadonnées frontmatter
    manifest.yaml     # (optionnel) Métadonnées machine: version, tags, deps
    index.js          # (optionnel) Logique exécutable Node.js
    config.schema.yaml # (optionnel) Schéma de configuration
    README.md         # (optionnel) Documentation humaine
```

### 5.2 Format SKILL.md

Voir `docs/SKILL_FORMAT.md` pour la spécification complète.

```markdown
---
name: google-search
version: 1.0.0
description: "Effectue une recherche Google et retourne les résultats"
tags: [web, search, information]
tools: [browser.goto, browser.typeInFocusedField, browser.pressEnter, extract_text]
permissions: [browser]
mcps: [mcp-browser]
gpu_class: light    # light | medium | heavy | vision
author: laruche-core
enabled: true
---

## Description
Recherche des informations sur Google.

## Quand utiliser
Quand l'utilisateur demande de chercher quelque chose sur le web,
trouver une information, ou rechercher un sujet en ligne.

## Mots-clés déclencheurs
cherche, recherche, google, trouve, lookup, search, "qu'est-ce que"

## Étapes
1. Ouvrir Google (https://google.com)
2. Taper la requête de recherche
3. Appuyer sur Entrée
4. Extraire les 5 premiers résultats

## Limitations
- Ne peut pas accéder aux contenus payants
- Limité aux 5 premiers résultats
```

### 5.3 Niveaux de priorité (inspiration OpenClaw)

```
Priorité de chargement (du plus haut au plus bas) :

  1. workspace/skills/   (skills utilisateur, édition directe)
  2. .laruche/skills/    (skills installés via CLI)
  3. skills/             (skills projet, versionnés dans le repo)
  4. BUILTIN_SKILLS      (fallback hardcodé dans planner.js)
```

### 5.4 skillLoader.ts — Chargement + injection sélective

Voir `src/skills/skillLoader.ts` — module TypeScript qui :
- Scanne les 4 niveaux de priorité
- Parse les frontmatter YAML des SKILL.md
- Expose `getRelevantSkills(intent, maxSkills)` : sélectionne les skills pertinents par mots-clés/tags
- Expose `getAllSkills()`, `getSkill(name)`, `reloadSkills()`
- Cache 30s (invalidation automatique si fichiers changent)

### 5.5 Intégration dans le pipeline

**Dans planner.js :**
```js
// Remplacer loadSkillsCatalog() par skillLoader
import { getRelevantSkills } from '../skills/skillLoader.js';

// Injection sélective (max 10 skills pertinents au lieu de tout le catalogue)
const relevantSkills = await getRelevantSkills(intent, 10);
```

**Dans intentPipeline.js :**
```js
// Remplacer loadDynamicSkills() par skillLoader
const skill = skillLoader.getSkill(step.type);
if (skill?.indexPath) {
  const mod = await import(skill.indexPath);
  return await mod.execute(step, context);
}
```

### 5.6 CLI skill-manager (`scripts/skill-manager.js`)

```bash
laruche skill list             # Lister tous les skills disponibles
laruche skill info <name>      # Détails d'un skill
laruche skill create <desc>    # Générer un skill par IA
laruche skill enable <name>    # Activer un skill
laruche skill disable <name>   # Désactiver un skill
laruche skill install <path>   # Installer depuis un dossier/URL
laruche skill validate <name>  # Valider le SKILL.md
```

---

## 6. Phase C — Gateway multi-canaux

### 6.1 Abstraction Gateway

```
src/gateway/
  index.js          # Entry point gateway
  registry.js       # Registre des canaux actifs
  normalizer.js     # Normalisation des messages (texte, média, pièces jointes)
  router.js         # Routing message → agent/pipeline
  session.js        # Cycle de vie des sessions
  channels/
    telegram.js     # ✅ existant (Telegraf)
    rest.js         # ✅ existant (modes/standalone.js)
    discord.js      # 🔲 à implémenter (discord.js)
    slack.js        # 🔲 à implémenter (Bolt for Slack)
    webhook.js      # 🔲 générique HTTP webhook
```

### 6.2 Interface Channel (contrat)

```typescript
interface Channel {
  name: string;
  init(): Promise<void>;
  send(session: Session, message: NormalizedMessage): Promise<void>;
  on(event: 'message', handler: (msg: InboundMessage) => void): void;
}

interface NormalizedMessage {
  text: string;
  media?: MediaAttachment[];
  sessionId: string;
  channelId: string;
  senderId: string;
  replyToId?: string;
}
```

### 6.3 Plan d'implémentation

| Canal | Dépendance | Priorité | Config requise |
|-------|-----------|----------|----------------|
| Telegram | ✅ Telegraf (existant) | — | TELEGRAM_BOT_TOKEN |
| REST/WebChat | ✅ Hono (existant) | — | API_PORT |
| Discord | discord.js | Haute | DISCORD_BOT_TOKEN |
| Slack | @slack/bolt | Haute | SLACK_BOT_TOKEN |
| Webhook générique | — | Moyenne | WEBHOOK_SECRET |
| WhatsApp | whatsapp-web.js | Basse | WHATSAPP_SESSION |

---

## 7. Phase D — Fiabilité et logs

### 7.1 Gestionnaire d'erreurs central

```
src/utils/
  errorHandler.ts     # Gestionnaire central : LLM errors, MCP errors, pipeline
  correlationId.ts    # Génération d'IDs de corrélation par mission
  retryPolicy.ts      # Politique de retry (exponentielle, max attempts)
  circuitBreaker.ts   # Circuit breaker pour les MCP servers
```

### 7.2 Schema de logs unifié

```json
{
  "ts": "2026-03-12T04:00:00.000Z",
  "level": "info",
  "missionId": "m-uuid",
  "correlationId": "corr-uuid",
  "component": "butterflyLoop",
  "event": "worker_completed",
  "model": "llama3.2:3b",
  "tokens": { "in": 412, "out": 89 },
  "durationMs": 2341,
  "error": null
}
```

### 7.3 Tests critiques à ajouter

```
test/
  unit/
    skillLoader.test.ts     # Parse SKILL.md, priorités, cache
    errorHandler.test.ts    # Retry, circuit breaker
    normalizer.test.ts      # Normalisation messages gateway
  integration/
    butterflyLoop.test.js   # Mission end-to-end (mock Ollama)
    mcpRetry.test.js        # Retry MCP avec backoff
  smoke.js                  # ✅ existant (22 tests)
```

---

## 8. Phase E — Politique GPU

### 8.1 Classes de tâches → modèles

```yaml
# config/gpu-policy.yaml
policy:
  routing:           # Détection d'intent, classification
    model: llama3.2:3b
    max_tokens: 200
    temperature: 0.0

  planning:          # Génération de plan JSON
    model: glm-4.6
    max_tokens: 500
    temperature: 0.1

  execution:         # Workers parallèles
    model: llama3.2:3b
    max_tokens: 1000
    temperature: 0.2

  synthesis:         # Consolidation finale
    model: qwen3-coder
    max_tokens: 2000
    temperature: 0.3

  vision:            # Analyse d'écran (déclenchée explicitement)
    model: llama3.2-vision
    max_tokens: 500
    enabled: "${VISION_ENABLED:-true}"
    max_per_mission: 3   # Limite de screenshots par mission

  heavy:             # Tâches complexes (code, architecture)
    model: qwen3-coder:32b
    max_tokens: 4000
    temperature: 0.05
```

### 8.2 Règles GPU-efficiency

1. **Ne jamais appeler un modèle vision pour du texte** — `isComputerUseIntent()` doit être strict
2. **Limiter les screenshots** : `MAX_SCREENSHOTS_PER_MISSION=3` (configurable)
3. **Cache les réponses de routing** : même intent → même plan pendant 60s
4. **Workers parallèles sans vision** par défaut, vision activée uniquement si step le demande explicitement
5. **Mode économique** : `LARUCHE_MODE=low` → tous les modèles downgraded (llama3.2:3b uniquement)

---

## 9. Phase F — Roadmap

### Court terme (v4.1 — 1-2 semaines)

- [ ] **Skills system** : skillLoader.ts + format SKILL.md + 10 skills d'exemple
- [ ] **Injection sélective** : remplacer catalogue complet par `getRelevantSkills()`
- [ ] **CLI skill-manager** : list, create, enable, disable, validate
- [ ] **GPU policy config** : `config/gpu-policy.yaml` + respect dans model_router.js

### Moyen terme (v4.2 — 1 mois)

- [ ] **Gateway abstraction** : normalizer.js + registry + sessions
- [ ] **Canal Discord** : discord.js adapter
- [ ] **Canal Slack** : Bolt adapter
- [ ] **Context engine** : compaction + résumé glissant pour sessions longues
- [ ] **Mémoire par agent** : SQLite per-agent (remplacer sql.js global)

### Long terme (v5.0 — Vision)

- [ ] **Plugin system** : Slots (Channel · Tool · Provider · Memory) + hooks
- [ ] **LaRuche Hub** : registry de skills en ligne (inspiration ClawHub)
- [ ] **Smart home** : skills Philips Hue, Sonos, Spotify (via Home Assistant API)
- [ ] **Canvas system** : interface HTML interactive sur HUD/browser
- [ ] **TEE / Privacy-first** : exécution sécurisée, chiffrement vault
- [ ] **Apps mobiles** : gateway depuis iOS/Android (inspiration OpenClaw apps)

---

*Document généré automatiquement. Dernière mise à jour : 2026-03-12.*
