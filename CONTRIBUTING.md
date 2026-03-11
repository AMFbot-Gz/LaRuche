# 🐝 Contribuer à LaRuche

Bienvenue dans la Ruche Mondiale ! Chaque contribution compte.

## Table des matières

- [Code de conduite](#code-de-conduite)
- [Environnement de développement](#environnement-de-développement)
- [Ajouter un MCP Server](#ajouter-un-mcp-server)
- [Ajouter un Skill](#ajouter-un-skill)
- [Ajouter un Agent](#ajouter-un-agent)
- [Ajouter une commande CLI](#ajouter-une-commande-cli)
- [Conventions de code](#conventions-de-code)
- [Soumettre une Pull Request](#soumettre-une-pull-request)

---

## Code de conduite

- **Bienveillant et inclusif** — Feedback constructif, pas d'attaques personnelles
- **Patient** — Nous sommes tous à des niveaux différents
- **Pédagogue** — Documentez, expliquez, aidez

---

## Environnement de développement

```bash
# Fork et clone
git clone https://github.com/VOTRE_USERNAME/LaRuche.git
cd LaRuche
npm install
cp .env.example .env
# Renseigner TELEGRAM_BOT_TOKEN et ADMIN_TELEGRAM_ID

# Mode développement (hot-reload, verbose)
laruche dev

# Ou directement
node src/queen_oss.js

# Tests smoke (22 tests)
node test/smoke.js
```

### Structure des branches

| Branche | Usage |
|---------|-------|
| `main` | Production stable |
| `feat/*` | Nouvelles features |
| `fix/*` | Corrections de bugs |
| `docs/*` | Documentation uniquement |

---

## Ajouter un MCP Server

Un MCP server expose des tools aux agents via JSON-RPC over stdio.

### 1. Créer `mcp_servers/my_tool_mcp.js`

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "laruche-my-tool", version: "1.0.0" });

server.tool(
  "myTool.doSomething",
  { input: z.string() },
  async ({ input }) => {
    const result = `processed: ${input}`;
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, result }) }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 2. Enregistrer dans `config/agents.yml`

```yaml
tools:
  myTool.doSomething: { mcp: "mcp-my-tool", fn: "myTool.doSomething" }
```

### 3. Autoriser pour un agent

```yaml
agents:
  devops:
    tools_allowed:
      - myTool.*
```

---

## Ajouter un Skill

Un skill guide le comportement de l'agent pour un type de tâche spécifique.

### `workspace/skills/my_skill/SKILL.md`

```markdown
---
name: my_skill
version: 1.0.0
description: Ce que fait ce skill en une phrase.
tags: [automation, web]
scope: global
agents: [devops, builder]
tools:
  - terminal.safe
risk: low
requires_hitl: false
---

# Skill: My Skill

Description détaillée du comportement attendu de l'agent.

## Étapes

1. Étape un
2. Étape deux

## Gestion des erreurs

Que faire si les étapes échouent.
```

Les skills sont auto-chargés au démarrage — pas de redémarrage nécessaire.

---

## Ajouter un Agent

### `workspace/agents/my_agent/AGENT.md`

```markdown
---
name: my_agent
role: My Agent Role
model_primary: ollama://llama3.2:latest
model_fallback: ollama://llama3.2:3b
tools_allowed:
  - terminal.safe
  - vault.*
max_iterations: 10
---

# My Agent

Description de ce que fait cet agent.
```

### Enregistrer dans `config/agents.yml`

```yaml
agents:
  my_agent:
    description: "Mon agent custom"
    soul: "workspace/agents/my_agent/AGENT.md"
    llm:
      primary: { provider: ollama, model: "llama3.2:latest" }
    loop:
      max_iterations: 10
    tools_allowed: [terminal.safe, vault.*]
```

```bash
# Utilisation immédiate
laruche agent my_agent "effectue cette tâche"
# Telegram: /agent my_agent effectue cette tâche
```

---

## Ajouter une commande CLI

Editez `bin/laruche.js`, ajoutez avant `program.parse()` :

```javascript
program
  .command("ma-commande [args...]")
  .description("Ce que ça fait")
  .option("--flag", "Description du flag")
  .action(async (args, opts) => {
    const spinner = ora("En cours...").start();
    try {
      // implémentation
      spinner.succeed("Terminé !");
    } catch (e) {
      spinner.fail(chalk.red(e.message));
    }
  });
```

---

## Conventions de code

- **ESM obligatoire** (`import/export`, jamais `require()`)
- **async/await** partout, jamais `.then()` chaîné
- **camelCase** pour JS/TS, **snake_case** pour les noms de skills
- **Commentaires** : français pour l'UI/logs, anglais pour les identifiants code
- **Secrets** : jamais en dur — toujours `process.env`
- **Gestion d'erreurs** : jamais `catch() {}` vide — minimum `catch(e) { logger.error(e.message) }`
- **Entry point** : `src/queen_oss.js` est canonique, `queen.js` est legacy
- **Commits** : préfixes `feat:` / `fix:` / `perf:` / `docs:` / `test:`

---

## Soumettre une Pull Request

1. **Créer une branche** :
   ```bash
   git checkout -b feat/ma-super-feature
   ```

2. **Développer** avec les conventions ci-dessus

3. **Tester** :
   ```bash
   node test/smoke.js
   # 22/22 tests doivent passer
   ```

4. **Commit** clair :
   ```bash
   git commit -m "feat: ajouter support multi-modèles pour le streaming"
   ```

5. **PR** vers `main` avec le template fourni

### Checklist avant de soumettre

- [ ] `node test/smoke.js` — 22/22 passent
- [ ] Pas de secrets dans le diff (`git diff`)
- [ ] Nouveau MCP enregistré dans `config/agents.yml`
- [ ] Nouveau skill avec `SKILL.md` complet
- [ ] `docs/ARCHITECTURE.md` mis à jour si la structure change

---

## Questions ?

- 💬 [GitHub Discussions](https://github.com/AMFbot-Gz/LaRuche/discussions)
- 🐛 [Issues](https://github.com/AMFbot-Gz/LaRuche/issues)

---

*🐝 Une abeille seule fait du miel. Un essaim change le monde.*
