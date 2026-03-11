# LaRuche — Guide d'Intégration Workspace + Agents

## Structure ajoutée

```
LaRuche_bot/
├── workspace/                    ← Couche lisible/versionnable (NEW)
│   ├── README.md
│   ├── memory/
│   │   └── MEMORY.md             ← Mémoire longue durée (éditable)
│   ├── sessions/                 ← Historique sessions par agent (auto)
│   │   ├── operator/
│   │   ├── devops/
│   │   └── builder/
│   ├── skills/                   ← Skills modulaires
│   │   ├── open_browser/SKILL.md
│   │   ├── manage_projects/SKILL.md
│   │   ├── devops_logs/SKILL.md
│   │   └── code_generation/SKILL.md
│   ├── cron/
│   │   └── jobs.yml              ← Jobs planifiés (éditable)
│   └── agents/
│       ├── operator/AGENT.md     ← Soul + config lisible
│       ├── devops/AGENT.md
│       └── builder/AGENT.md
├── config/
│   └── agents.yml                ← Config agents/providers/tools (NEW)
├── src/
│   ├── agents/
│   │   ├── agentLoop.ts          ← Boucle agent principale (NEW)
│   │   └── agentBridge.js        ← Bridge JS→TS (NEW)
│   ├── llm/
│   │   └── provider.ts           ← LLM provider-agnostic (NEW)
│   ├── tools/
│   │   └── toolRouter.ts         ← Tool router MCP/scripts (NEW)
│   └── utils/
│       └── yaml.ts               ← Parser YAML minimal (NEW)
```

## Installation

### 1. Dépendances TypeScript (optionnel mais recommandé)

```bash
cd ~/LaRuche_bot
npm install --save-dev typescript tsx @types/node
npx tsc --init   # Génère tsconfig.json
```

### 2. Sans TypeScript (mode dégradé JS)

Le `agentBridge.js` détecte automatiquement si TypeScript est compilé.
Sans compilation, il utilise directement `model_router.js` comme fallback.

### 3. Variables d'environnement

```bash
# Ollama (déjà configuré)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL_STRATEGIST=glm-4.6:cloud
OLLAMA_MODEL_ARCHITECT=qwen3-coder:480b-cloud
OLLAMA_MODEL_WORKER=llama3.2:3b

# Activer d'autres providers quand disponibles
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_ENABLED=true

KIMI_API_KEY=...
KIMI_ENABLED=true
```

## Utilisation

### Via CLI

```bash
# Lancer un agent
laruche agent devops "analyse les logs PM2 et corrige les erreurs"
laruche agent builder "génère un module Express avec auth JWT"
laruche agent operator "ouvre Chrome sur google.com"

# Reprendre une session
laruche agent devops "continue" --session devops_1741648800_abc123

# Voir les sessions
laruche session
laruche session devops
```

### Via Telegram

```
/agent devops analyse les logs PM2
/agent builder crée un skill pour scraper Google
/agent operator ouvre Safari sur github.com
```

### Via queen_oss.js (programmatique)

```js
import { runAgent } from "./agents/agentBridge.js";

const result = await runAgent({
  agentName: "devops",
  userInput: "déploie laruche-queen via PM2",
  onToken: (t) => process.stdout.write(t),
  onToolCall: (tool, args) => console.log(`[${tool}]`, args),
});
```

### Depuis la boucle Swarm (butterfly loop)

Dans `butterflyLoop()`, pour déléguer une sous-tâche à un agent spécialisé :

```js
// Détection du bon agent
const agentForTask = (task) => {
  if (/code|génère|function/.test(task)) return "builder";
  if (/clique|ouvre|tape/.test(task)) return "operator";
  return "devops";
};

// Dans l'exécution parallèle des tâches
const results = await Promise.all(
  plan.tasks.map(async (task) => {
    const agentName = agentForTask(task.description);
    return runAgent({
      agentName,
      userInput: task.description,
      onToken: (t) => hud({ type: "code_chunk", code: t }),
    });
  })
);
```

## Mode Headless vs Mode Complet

### Mode Headless (léger, sans workspace)

```bash
# Variables env pour désactiver workspace
LARUCHE_MODE=headless node src/queen_oss.js
```

Dans `queen_oss.js`, le `agentBridge.js` détecte `LARUCHE_MODE=headless`
et utilise directement `model_router.js` sans charger le workspace.

### Mode Complet (workspace + HUD + Dashboard)

```bash
laruche start   # PM2 démarre queen + hud + watcher + dashboard
```

Le workspace est chargé automatiquement à chaque session.

## Ajouter un nouveau Skill

```bash
mkdir -p workspace/skills/mon_skill
cat > workspace/skills/mon_skill/SKILL.md << 'EOF'
---
name: mon_skill
version: 1.0.0
description: Description courte
tags: [tag1, tag2]
scope: global
agents: [devops]
tools:
  - terminal.safe
risk: low
cost: low
requires_hitl: false
---

# Skill: Mon Skill

Description détaillée...

## Steps
1. Étape 1
2. Étape 2
EOF
```

Le skill est chargé automatiquement au prochain démarrage d'agent.

## Ajouter un nouveau Provider LLM

Dans `src/llm/provider.ts`, la méthode `openaiComplete()` supporte
n'importe quel provider compatible OpenAI (format /v1/chat/completions).

```bash
# Activer OpenRouter
echo "OPENROUTER_API_KEY=sk-or-..." >> .env
echo "OPENROUTER_ENABLED=true" >> .env
```

Dans `config/agents.yml`, changer le provider d'un agent :
```yaml
agents:
  builder:
    llm:
      primary:
        provider: openrouter
        model: "anthropic/claude-3-5-sonnet"
```

## Performances

- **Sessions** : fichiers JSON sur disque, < 1ms lecture
- **Memory** : chargement synchrone MEMORY.md, filtré par scope
- **Skills** : chargés une fois par session, mis en cache
- **Tool calls** : cache 5s pour opérations read-only (janitor.stats, skill.list)
- **Batch HID** : typeText consécutifs fusionnés en 1 appel
- **Batch terminal** : commandes safe enchaînées avec `&&`
