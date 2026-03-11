# Contributing to LaRuche 🐝

Welcome to the Hive. Here's how to extend LaRuche.

## Table of Contents

1. [Add a MCP Server](#1-add-a-mcp-server)
2. [Add a Workspace Skill](#2-add-a-workspace-skill)
3. [Add an Agent Config](#3-add-an-agent-config)
4. [Add a CLI Command](#4-add-a-cli-command)
5. [Development Setup](#5-development-setup)
6. [Code Conventions](#6-code-conventions)

---

## 1. Add a MCP Server

A MCP server exposes tools to agents via JSON-RPC over stdio.

### Minimal template: `mcp_servers/my_tool_mcp.js`

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "laruche-my-tool", version: "1.0.0" });

server.tool(
  "myTool.doSomething",            // tool name (dot notation: category.action)
  { input: z.string() },           // Zod schema for args
  async ({ input }) => {
    // Your implementation
    const result = `processed: ${input}`;
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, result }) }]
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Register in `config/agents.yml`

```yaml
tools:
  myTool.doSomething:  { mcp: "mcp-my-tool", fn: "myTool.doSomething" }
```

### Register in `src/tools/toolRouter.ts`

```typescript
// Add to MCP_SERVERS:
"mcp-my-tool": { command: "node", args: ["mcp_servers/my_tool_mcp.js"] },

// Add to TOOL_MAP:
"myTool.doSomething": { mcp: "mcp-my-tool", fn: "myTool.doSomething" },
```

### Allow for an agent in `config/agents.yml`

```yaml
agents:
  devops:
    tools_allowed:
      - myTool.*
```

---

## 2. Add a Workspace Skill

Skills guide agent behavior for specific task types.

### Create `workspace/skills/my_skill/SKILL.md`

```markdown
---
name: my_skill
version: 1.0.0
description: One sentence describing what this skill enables.
tags: [tag1, tag2]
scope: global                 # global | workspace | agent-specific
agents: [devops, builder]     # which agents can use this
tools:
  - terminal.safe
  - vault.store
risk: low                     # low | medium | high
cost: low                     # low | medium | high
requires_hitl: false
---

# Skill: My Skill

What the agent should do when this skill is activated.

## Steps

1. Step one
2. Step two

## Prompt Pattern

\`\`\`
Action: my_skill
param: value
\`\`\`

## Error Handling

What to do if steps fail.
```

### Optional: Add code `workspace/skills/my_skill/index.js`

```javascript
// Optional wrapper for complex skill logic
export async function run(params) {
  // Direct implementation
  return { success: true, result: "..." };
}
```

Skills are auto-loaded at agent session start — no restart needed.

---

## 3. Add an Agent Config

### Add soul file `workspace/agents/my_agent/AGENT.md`

```markdown
---
name: my_agent
role: My Agent Role
persona: Brief description of personality and behavior.
model_primary: ollama://llama3.2:latest
model_fallback: ollama://llama3.2:3b
capabilities:
  - my_capability
tools_allowed:
  - terminal.safe
  - vault.*
tools_denied:
  - hid.*
max_iterations: 10
max_tool_calls: 30
hitl_threshold: 0.5
security_level: medium
---

# My Agent

Description of what this agent does.

## Behavior Guidelines

1. Guideline one
2. Guideline two
```

### Register in `config/agents.yml`

```yaml
agents:
  my_agent:
    description: "My custom agent"
    soul: "workspace/agents/my_agent/AGENT.md"
    llm:
      primary: { provider: ollama, model: "${OLLAMA_MODEL_WORKER:-llama3.2:latest}" }
      fallback: { provider: ollama, model: "llama3.2:3b" }
      temperature: 0.3
      top_p: 0.9
      streaming: true
      timeout_ms: 45000
    loop:
      max_iterations: 10
      max_tool_calls: 30
      hitl_threshold: 0.5
      retry_on_error: 2
    tools_allowed: [terminal.safe, vault.*]
    tools_denied: [hid.*]
    memory:
      load_global: true
      load_agent_specific: true
      max_entries: 15
      use_vector_search: false
```

Use it immediately:

```bash
laruche agent my_agent "do something"
# Telegram: /agent my_agent do something
```

---

## 4. Add a CLI Command

Edit `bin/laruche.js`, add before `program.parse()`:

```javascript
program
  .command("my-command [args...]")
  .description("What it does")
  .option("--flag", "Description of flag")
  .action(async (args, opts) => {
    const spinner = ora("Working...").start();
    try {
      // implementation
      spinner.succeed("Done!");
    } catch (e) {
      spinner.fail(chalk.red(e.message));
    }
  });
```

---

## 5. Development Setup

```bash
git clone https://github.com/AMFbot-Gz/LaRuche.git
cd LaRuche
npm install
cp .env.example .env
# Edit .env: set TELEGRAM_BOT_TOKEN and ADMIN_TELEGRAM_ID

# Run in dev mode (verbose, no PM2)
laruche dev

# Or directly
node src/queen_oss.js
```

**Optional TypeScript compilation:**

```bash
npm install --save-dev typescript tsx
npx tsc --init
npx tsx src/agents/agentLoop.ts   # test TS file
```

**Run tests:**

```bash
node test/smoke.js
```

---

## 6. Code Conventions

- **Language**: French for comments/UI, English for code identifiers
- **Modules**: ES Modules (`import`/`export`), never CommonJS
- **Async**: Always `async/await`, never `.then()` chains
- **Error handling**: Never `catch() {}` — at minimum `catch(e) { logger.error(e.message) }`
- **Config**: Always read from `.env` via `process.env`, never hardcode
- **Secrets**: Never commit tokens or API keys
- **Entry point**: `src/queen_oss.js` is the canonical entry — `queen.js` is legacy
- **MCP tools**: Use `z.` Zod schemas for all tool arguments
- **Commits**: `feat:` / `fix:` / `perf:` / `docs:` / `test:` prefix

## PR Checklist

- [ ] `node test/smoke.js` passes (22/22)
- [ ] No secrets in diff
- [ ] New tool registered in `config/agents.yml` and `toolRouter.ts`
- [ ] New skill has `SKILL.md` with complete frontmatter
- [ ] `docs/ARCHITECTURE.md` updated if structure changed
