# Plan de travail phasé — Transformation LaRuche vers qualité PicoClaw

> Référence : `docs/ARCHITECTURE_FULL.md` pour le contexte complet  
> Date : 2026-03-12

---

## Phase 1 — Audit complet ✅ (ce document)

**Livrable** : `docs/ARCHITECTURE_FULL.md` — architecture complète, diagrammes, 15 points faibles documentés.

---

## Phase 2 — Système de skills PicoClaw-like ✅ (PRs #4 + #5)

**Livrable** : `src/skills/skillLoader.js`, `skillRegistry.ts`, `scripts/skill-manager.js`, 5 SKILL.md exemples.

**À faire** : merger les PRs #4 et #5 dans main.

**Flag de transition** (à ajouter dans `.env.example`) :
```
# Contrôle du mode de chargement des skills
# builtin  = uniquement les 23 skills hardcodés (comportement original)
# dynamic  = uniquement SKILL.md depuis les 4 répertoires
# mixed    = dynamic + fallback builtin (recommandé pour la transition)
SKILLS_MODE=mixed
```

---

## Phase 3 — Corps de l'agent : orchestrateur & agents

### 3.1 Corriger les bugs critiques (C1-C5)

**C1 — Double orchestrateur** :
- Conserver `queen_oss.js` comme seul orchestrateur canonique
- Supprimer ou archiver `queen.js` (vérifier qu'aucun `import` ne pointe dessus)
- Fichiers : `src/queen.js` → `src/queen.js.bak` ou suppression

**C2 + C3 — janitor.js bugs ESM + dépendance manquante** :
```js
// Avant (ligne 67) — CRASH en ESM
const { listSkills } = require('./skill_evolution.js');

// Après — import dynamique ESM
const { listSkills } = await import('./skill_evolution.js');
```
- Remplacer `better-sqlite3` par `sql.js` (déjà en dépendance) ou ajouter `better-sqlite3` dans `package.json`

**C4 — Activer HITL dans le main flow** :
- Merger PR #2 (`fix/hitl-activation`)
- Câbler `onHITL` callback dans `queen_oss.js` → envoyer message Telegram HITL à l'admin

**C5 — Connecter agentLoop.ts** :
- Corriger chemin config : `configuration/agents/` → `config/agents/`
- Appeler `runAgentLoop()` depuis queen_oss.js pour les missions nécessitant des tool calls
- Merger PR #3 (fallback chain) pour que provider.ts soit pleinement fonctionnel

### 3.2 Struct Mission claire

**Objectif** : remplacer les strings passées dans `butterflyLoop` par un objet Mission structuré.

```typescript
// src/types/mission.ts
export interface Mission {
  id: string;                    // UUID
  correlation_id: string;        // Pour trace distribuée
  user_prompt: string;
  channel: "telegram" | "cli" | "rest" | "hud";
  status: "pending" | "running" | "success" | "error" | "hitl_pending";
  plan?: { goal: string; tasks: MissionTask[] };
  steps: MissionStep[];
  allowed_tools: string[];       // Vide = tous autorisés
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  models_used: string[];
  result?: string;
  error?: string;
}

export interface MissionTask {
  id: number;
  description: string;
  role: string;
  result?: string;
  model?: string;
  error?: string;
}

export interface MissionStep {
  skill: string;
  params: Record<string, any>;
  result?: any;
  success: boolean;
  duration_ms?: number;
  hitl_approved?: boolean;
}
```

**Diff queen_oss.js** (extrait clé) :
```js
// Avant
export async function butterflyLoop(command, replyFn, missionId) {
  // ... strings partout ...
}

// Après
export async function butterflyLoop(command, replyFn, missionId) {
  const mission = createMission({
    id: missionId || randomUUID(),
    user_prompt: command,
    channel: missionId ? "rest" : "telegram",
  });
  // ... mission.status = "running" ...
  // ... mission.steps.push({ skill, result }) ...
  // ... saveMission(mission) ...
}
```

### 3.3 Clarifier les rôles agents

| Agent | Modèle | Responsabilité | Prompt type |
|---|---|---|---|
| Stratège (L1) | glm-4.6 | Décomposer la mission en tâches | Planification haute-niveau |
| Architecte (L2) | qwen3-coder | Code, debug, génération skills | Prompt code strict |
| Ouvrière (L3) | llama3.2:3b | Micro-tâches rapides, synthèse | Réponse directe |
| Vision (L4) | llava/llama3.2-vision | Analyse écran, validation | "Que vois-tu ?" |
| Planner | strategist | Plan computer-use → JSON steps | JSON strict |

### 3.4 Helper LLM centralisé

```js
// src/llm/callLLM.js — helper unique pour tous les agents
export async function callLLM(prompt, opts = {}) {
  const {
    role = "worker",
    mission_id,       // Pour corrélation dans les logs
    step_id,
    retries = 2,
    timeout = 60000,
    temperature = 0.3,
  } = opts;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await ask(prompt, { role, temperature, timeout });
      logger.info({ mission_id, step_id, role, model: result.model,
                    tokens: result.text?.length, attempt });
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await delay(1000 * (attempt + 1));
    }
  }
  throw new Error(`LLM call failed after ${retries} retries: ${lastError.message}`);
}
```

---

## Phase 4 — Gestion des erreurs, logs et IDs de corrélation

### 4.1 Gestionnaire d'erreurs centralisé

```js
// src/utils/errorHandler.js
export class LaRucheError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.code = opts.code || 'UNKNOWN';
    this.mission_id = opts.mission_id;
    this.step_id = opts.step_id;
    this.recoverable = opts.recoverable ?? true;
    this.context = opts.context || {};
  }
}

export function handleError(err, context = {}) {
  const structured = err instanceof LaRucheError ? err
    : new LaRucheError(err.message, { code: 'UNHANDLED', ...context });

  logger.error({
    type: 'error',
    code: structured.code,
    message: structured.message,
    mission_id: structured.mission_id || context.mission_id,
    step_id: structured.step_id || context.step_id,
    recoverable: structured.recoverable,
    stack: structured.stack,
  });

  return structured;
}
```

### 4.2 Corrélation IDs

```
chaque Mission → mission_id (UUID)
  │
  ├─ chaque appel LLM → step_id = `${mission_id}/llm/${n}`
  ├─ chaque appel MCP → tool_call_id = `${mission_id}/mcp/${tool}/${n}`
  └─ chaque log → { timestamp, level, mission_id, step_id, ... }
```

**Tous les appels LLM et MCP passent le `mission_id` dans le contexte de log.**

### 4.3 Schema de log unifié (JSON)

```json
{
  "ts": "2026-03-12T04:00:00.000Z",
  "level": "info",
  "mission_id": "abc-123",
  "step_id": "abc-123/llm/1",
  "component": "model_router",
  "event": "llm_call",
  "model": "glm-4.6",
  "role": "strategist",
  "duration_ms": 1240,
  "tokens_out": 87
}
```

**Stockage** : `.laruche/logs/queen.log` (JSON lines), rotation Janitor Pro.

### 4.4 Tests de résilience

```js
// test/unit/errorHandling.test.js
describe('Error handling', () => {
  it('LLM timeout → retries then returns error result', ...)
  it('MCP crash → mission continues with error step', ...)
  it('butterflyLoop crash → mission saved as status:error', ...)
  it('HITL rejected → continues with HITL_REJECTED tool result', ...)
})
```

---

## Phase 5 — Politique GPU / modèles

### 5.1 Câbler gpu-policy.yaml dans model_router.js

`config/gpu-policy.yaml` est créé (PR #4). Il faut le lire dans `model_router.js` :

```js
// src/model_router.js — ajout
import { loadGpuPolicy, getModelForTask } from './gpu_policy.js';

// Dans ask() — avant l'appel Ollama
const taskClass = detectTaskClass(prompt, role);
const policyModel = getModelForTask(taskClass, mode);
const model = policyModel || (role ? roles[role] : await route(task));
```

### 5.2 src/gpu_policy.js

```js
// Charge gpu-policy.yaml + expose getModelForTask(taskClass, mode)
import { readFileSync } from 'fs';
import { parse as parseYaml } from './utils/yaml.js';

let _policy = null;
export function loadGpuPolicy() {
  if (_policy) return _policy;
  // fallback: {} si fichier absent
  _policy = parseYaml(readFileSync('config/gpu-policy.yaml', 'utf-8')) || {};
  return _policy;
}

export function getModelForTask(taskClass, mode = process.env.LARUCHE_MODE || 'balanced') {
  const policy = loadGpuPolicy();
  return policy?.task_classes?.[taskClass]?.[mode]?.model ?? null;
}

export function detectTaskClass(prompt, role) {
  if (role === 'vision' || /screenshot|écran|screen/i.test(prompt)) return 'vision';
  if (role === 'architect' || /code|script|function/i.test(prompt)) return 'code';
  if (role === 'strategist' || /plan|mission|objectif/i.test(prompt)) return 'planning';
  if (role === 'synthesizer') return 'synthesis';
  if (role === 'worker') return 'execution';
  return 'routing';
}
```

### 5.3 Options de config

```env
# .env.example — à ajouter
LARUCHE_MODE=balanced           # low | balanced | high
DISABLE_VISION=false            # true = désactive LLaVA/vision
CPU_ONLY=false                  # true = force modèles CPU
MAX_CONTEXT_TOKENS=4096         # Limite contexte globale
MAX_SCREENSHOTS_PER_MISSION=5   # Limite vision par mission
```

---

## Phase 6 — Dashboard & HUD

### 6.1 Dashboard React (audit à faire)

Vues à vérifier/ajouter :
- ✅ Liste missions + status
- ✅ Logs récents
- → Vue plan de mission (steps détaillés)
- → Vue tools/skills appelés par mission
- → Gauge GPU/CPU (systeminformation déjà en dép.)
- → Coût estimé tokens

### 6.2 HUD Electron

- Vérifier HITL modal (timer 60s, approve/reject)
- Vérifier ThoughtStream
- **Ajouter auth WS** : token partagé `.laruche/hud-token`
  ```js
  // queen_oss.js — wss.on('connection')
  wss.on('connection', (ws, req) => {
    const token = new URL(req.url, 'ws://x').searchParams.get('token');
    if (token !== HUD_TOKEN) { ws.close(4003, 'Unauthorized'); return; }
    hudClients.add(ws);
  });
  ```
- Améliorer les messages HITL : inclure `risk_score`, `tool_description`, `alternative_safe_action`

---

## Phase 7 — Multi-canaux (gateway PicoClaw-like)

### 7.1 Interface Channel

```typescript
// src/gateway/channel.ts
export interface Channel {
  name: string;
  send(to: string, message: string, opts?: MessageOpts): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface IncomingMessage {
  id: string;
  from: string;
  channel: string;
  text: string;
  ts: number;
}
```

### 7.2 Implémentations

```
src/gateway/
├── channel.ts          # Interface + types
├── telegram.ts         # Adaptateur Telegraf (existant → refactorisé)
├── discord.ts          # Stub / design (implem partielle)
├── slack.ts            # Stub / design
└── gatewayManager.ts   # Registre + routing
```

### 7.3 Logique message → mission (partagée)

```js
// src/gateway/messageHandler.js — remplace le bot.on("text") de queen_oss.js
export async function handleIncomingMessage(msg, channel) {
  const isComputerUse = isComputerUseIntent(msg.text);
  const replyFn = (text) => channel.send(msg.from, text);

  if (isComputerUse) {
    return runIntentPipeline(msg.text, { hudFn: broadcastHUD, ... });
  } else {
    return butterflyLoop(msg.text, replyFn);
  }
}
```

---

## Phase 8 — Tests E2E & documentation

### 8.1 Tests à écrire

```
test/
├── unit/
│   ├── skillLoader.test.js       # getAllSkills, getRelevantSkills
│   ├── errorHandler.test.js      # LaRucheError, handleError
│   ├── gpuPolicy.test.js         # detectTaskClass, getModelForTask
│   └── missionStruct.test.js     # createMission, updateMission
├── integration/
│   ├── llmFallback.test.js       # Ollama timeout → retry → fallback
│   └── mcpRetry.test.js          # MCP crash → 3 retries → error result
├── e2e/
│   ├── mission.e2e.js            # API POST /mission → résultat final
│   ├── skillDynamic.e2e.js       # Créer SKILL.md → planner l'utilise
│   └── dashboard.spec.js         # Playwright UI tests
└── smoke.js                      # Existant (22 tests) + nouveaux
```

### 8.2 Documentation

- `docs/HOW_TO_WRITE_A_SKILL.md` — format SKILL.md, index.js, exemples
- `docs/HOW_TO_ADD_A_CHANNEL.md` — implémenter l'interface Channel
- `docs/OPERATIONS_AND_DEBUGGING.md` — PM2, logs, corrélation IDs, debugging

---

## Tableau de bord des phases

| Phase | Statut | PRs | Impact fiabilité | Impact DX | Impact GPU |
|---|---|---|---|---|---|
| 1 — Audit | ✅ | #6 | - | +++ | - |
| 2 — Skills | ✅ pr | #4 #5 | + | +++ | + |
| 3 — Orchestrateur | 🔲 | TBD | +++ | ++ | - |
| 4 — Erreurs/Logs | 🔲 | TBD | +++ | ++ | - |
| 5 — GPU Policy | 🔲 | TBD | + | + | +++ |
| 6 — Dashboard/HUD | 🔲 | TBD | + | +++ | - |
| 7 — Multi-canal | 🔲 | TBD | + | ++ | - |
| 8 — Tests/Docs | 🔲 | TBD | ++ | +++ | - |
