/**
 * agentLoop.ts — LaRuche Agent Loop
 * PicoClaw-inspired: intake → context → LLM → tool calls → memory → persist
 *
 * Supports: operator | devops | builder agents
 * Provider-agnostic via src/llm/provider.ts
 * Tool-agnostic via src/tools/toolRouter.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { parse as parseYaml } from "../utils/yaml.js";
import { LLMProvider, Message, ToolCall } from "../llm/provider.js";
import { ToolRouter } from "../tools/toolRouter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentConfig {
  description: string;
  soul: string;
  llm: {
    primary: { provider: string; model: string };
    fallback: { provider: string; model: string };
    temperature: number;
    top_p: number;
    streaming: boolean;
    timeout_ms: number;
  };
  loop: {
    max_iterations: number;
    max_tool_calls: number;
    hitl_threshold: number;
    batch_hid?: boolean;
    batch_terminal?: boolean;
    chain_of_thought?: boolean;
    vision_limit?: number;
    retry_on_error: number;
  };
  tools_allowed: string[];
  tools_denied: string[];
  memory: {
    load_global: boolean;
    load_agent_specific: boolean;
    max_entries: number;
    use_vector_search: boolean;
  };
}

export interface Session {
  id: string;
  agent: string;
  created_at: string;
  updated_at: string;
  messages: Message[];
  tool_calls: Array<{ tool: string; args: unknown; result: unknown; ts: string }>;
  iterations: number;
  status: "running" | "completed" | "error" | "hitl_paused";
  metadata: Record<string, unknown>;
}

export interface AgentLoopOptions {
  agentName: string;
  userInput: string;
  sessionId?: string;           // Resume existing session
  onToken?: (token: string) => void;     // Streaming callback
  onToolCall?: (tool: string, args: unknown) => void;
  onHITL?: (action: string, risk: number) => Promise<boolean>;
}

export interface AgentLoopResult {
  sessionId: string;
  response: string;
  iterations: number;
  tool_calls_count: number;
  status: Session["status"];
}

// ─── Config loader ────────────────────────────────────────────────────────────

let _agentsConfig: Record<string, AgentConfig> | null = null;

function loadAgentsConfig(): Record<string, AgentConfig> {
  if (_agentsConfig) return _agentsConfig;
  const configPath = join(ROOT, "config/agents.yml");
  if (!existsSync(configPath)) {
    throw new Error(`config/agents.yml not found. Run: laruche init`);
  }
  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw);
  _agentsConfig = parsed.agents as Record<string, AgentConfig>;
  return _agentsConfig;
}

// ─── Session management ───────────────────────────────────────────────────────

function getSessionPath(agentName: string, sessionId: string): string {
  const dir = join(ROOT, "workspace/sessions", agentName);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${sessionId}.json`);
}

function loadSession(agentName: string, sessionId: string): Session | null {
  const path = getSessionPath(agentName, sessionId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  const path = getSessionPath(session.agent, session.id);
  session.updated_at = new Date().toISOString();
  writeFileSync(path, JSON.stringify(session, null, 2));
}

function createSession(agentName: string, sessionId?: string): Session {
  const id = sessionId || `${agentName}_${Date.now()}_${randomUUID().slice(0, 8)}`;
  return {
    id,
    agent: agentName,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    messages: [],
    tool_calls: [],
    iterations: 0,
    status: "running",
    metadata: {},
  };
}

// ─── Memory loader ────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: string;
  type: string;
  scope: string;
  tags: string[];
  content: string;
}

function loadMemoryEntries(agentName: string, config: AgentConfig): MemoryEntry[] {
  const memoryPath = join(ROOT, "workspace/memory/MEMORY.md");
  if (!existsSync(memoryPath)) return [];

  const raw = readFileSync(memoryPath, "utf-8");
  const entries: MemoryEntry[] = [];
  const blocks = raw.split("---\n\n").slice(1); // Skip header

  for (const block of blocks) {
    try {
      const fmMatch = block.match(/```yaml\n([\s\S]*?)```\n([\s\S]*)/);
      if (!fmMatch) continue;
      const fm = parseYaml(fmMatch[1]) as MemoryEntry;
      fm.content = fmMatch[2].trim();

      // Filter by scope
      if (fm.scope === "global" && config.memory.load_global) {
        entries.push(fm);
      } else if (fm.scope === `agent:${agentName}` && config.memory.load_agent_specific) {
        entries.push(fm);
      }
    } catch { /* skip malformed entries */ }
  }

  return entries.slice(0, config.memory.max_entries);
}

// ─── Skill loader ─────────────────────────────────────────────────────────────

interface SkillMeta {
  name: string;
  description: string;
  agents: string[];
  tools: string[];
  content: string;
}

function loadRelevantSkills(agentName: string, input: string): SkillMeta[] {
  const skillsDir = join(ROOT, "workspace/skills");
  if (!existsSync(skillsDir)) return [];

  const skills: SkillMeta[] = [];
  const inputLower = input.toLowerCase();

  for (const skillName of readdirSync(skillsDir)) {
    const skillMd = join(skillsDir, skillName, "SKILL.md");
    if (!existsSync(skillMd)) continue;

    try {
      const raw = readFileSync(skillMd, "utf-8");
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!fmMatch) continue;

      const fm = parseYaml(fmMatch[1]) as SkillMeta;
      fm.content = fmMatch[2].trim();

      // Include if: agent matches AND (tags match input OR skill name in input)
      const agentMatch = !fm.agents || fm.agents.includes(agentName) || fm.agents.includes("*");
      const relevanceMatch = fm.name && inputLower.includes(fm.name.replace(/_/g, " "));

      if (agentMatch || relevanceMatch) {
        skills.push(fm);
      }
    } catch { /* skip */ }
  }

  return skills.slice(0, 3); // Max 3 skills to avoid context bloat
}

// ─── System prompt builder ────────────────────────────────────────────────────

function buildSystemPrompt(
  agentName: string,
  soul: string,
  memory: MemoryEntry[],
  skills: SkillMeta[],
  tools: string[]
): string {
  const parts: string[] = [];

  // Agent soul
  if (existsSync(join(ROOT, soul))) {
    const soulContent = readFileSync(join(ROOT, soul), "utf-8");
    // Extract body (after frontmatter)
    const body = soulContent.replace(/^---[\s\S]*?---\n/, "").trim();
    parts.push(`# AGENT IDENTITY\n${body}`);
  }

  // Memory
  if (memory.length > 0) {
    const memStr = memory.map(m => `- [${m.type}] ${m.content}`).join("\n");
    parts.push(`# MEMORY (Long-term context)\n${memStr}`);
  }

  // Skills
  if (skills.length > 0) {
    const skillStr = skills.map(s =>
      `## Skill: ${s.name}\n${s.description}\n${s.content.slice(0, 500)}`
    ).join("\n\n");
    parts.push(`# AVAILABLE SKILLS\n${skillStr}`);
  }

  // Tool list
  if (tools.length > 0) {
    parts.push(`# TOOLS AVAILABLE\n${tools.map(t => `- ${t}`).join("\n")}`);
  }

  // Response format
  parts.push(`# RESPONSE FORMAT
When you need to use a tool, output EXACTLY:
\`\`\`tool_call
{"tool": "tool.name", "args": {"param": "value"}}
\`\`\`

When you have a final answer, output it directly without any tool_call block.
Always respond in French unless the user writes in English.`);

  return parts.join("\n\n---\n\n");
}

// ─── Tool call parser ─────────────────────────────────────────────────────────

function parseToolCalls(response: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /```tool_call\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.tool && typeof parsed.tool === "string") {
        calls.push({
          id: randomUUID(),
          name: parsed.tool,
          args: parsed.args || {},
        });
      }
    } catch { /* skip malformed */ }
  }

  return calls;
}

// ─── Batch optimizer ──────────────────────────────────────────────────────────

function batchHIDActions(calls: ToolCall[]): ToolCall[] {
  // Merge consecutive typeText calls into a single call
  const result: ToolCall[] = [];
  let i = 0;

  while (i < calls.length) {
    const call = calls[i];

    if (call.name === "hid.type" && i + 1 < calls.length && calls[i + 1].name === "hid.type") {
      // Merge consecutive type calls
      let combined = (call.args as { text: string }).text;
      let j = i + 1;
      while (j < calls.length && calls[j].name === "hid.type") {
        combined += (calls[j].args as { text: string }).text;
        j++;
      }
      result.push({ ...call, args: { text: combined } });
      i = j;
    } else {
      result.push(call);
      i++;
    }
  }

  return result;
}

function batchTerminalCommands(calls: ToolCall[]): ToolCall[] {
  // Merge consecutive terminal.safe calls into a single && chain
  const result: ToolCall[] = [];
  let i = 0;

  while (i < calls.length) {
    const call = calls[i];

    if (call.name === "terminal.safe" && i + 1 < calls.length && calls[i + 1].name === "terminal.safe") {
      const commands: string[] = [(call.args as { command: string }).command];
      let j = i + 1;
      while (j < calls.length && calls[j].name === "terminal.safe") {
        commands.push((calls[j].args as { command: string }).command);
        j++;
      }
      result.push({ ...call, args: { command: commands.join(" && ") } });
      i = j;
    } else {
      result.push(call);
      i++;
    }
  }

  return result;
}

// ─── Main Agent Loop ──────────────────────────────────────────────────────────

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { agentName, userInput, sessionId, onToken, onToolCall, onHITL } = options;

  // 1. Load agent config
  const config = loadAgentsConfig()[agentName];
  if (!config) throw new Error(`Unknown agent: ${agentName}. Available: ${Object.keys(loadAgentsConfig()).join(", ")}`);

  // 2. Init/restore session
  let session = sessionId ? loadSession(agentName, sessionId) : null;
  if (!session) session = createSession(agentName, sessionId);

  // 3. Load context
  const memory = loadMemoryEntries(agentName, config);
  const skills = loadRelevantSkills(agentName, userInput);

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt(
    agentName,
    config.soul,
    memory,
    skills,
    config.tools_allowed
  );

  // 5. Add user message to session
  session.messages.push({ role: "user", content: userInput });
  saveSession(session);

  // 6. Init LLM provider + Tool router
  const llm = new LLMProvider(config);
  const toolRouter = new ToolRouter(config.tools_allowed, config.tools_denied);

  let totalToolCalls = 0;
  let lastResponse = "";

  // 7. Main loop
  while (session.iterations < config.loop.max_iterations) {
    session.iterations++;

    // Build messages for LLM
    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      ...session.messages,
    ];

    // LLM call
    let response = "";
    try {
      if (config.llm.streaming && onToken) {
        for await (const chunk of llm.stream(messages)) {
          response += chunk;
          onToken(chunk);
        }
      } else {
        response = await llm.complete(messages);
      }
    } catch (e) {
      // Try fallback
      try {
        response = await llm.complete(messages, true);
      } catch {
        session.status = "error";
        saveSession(session);
        throw e;
      }
    }

    lastResponse = response;
    session.messages.push({ role: "assistant", content: response });

    // Parse tool calls
    let toolCalls = parseToolCalls(response);

    // No tool calls → final answer
    if (toolCalls.length === 0) {
      session.status = "completed";
      saveSession(session);
      break;
    }

    // Apply batching optimizations
    if (config.loop.batch_hid) toolCalls = batchHIDActions(toolCalls);
    if (config.loop.batch_terminal) toolCalls = batchTerminalCommands(toolCalls);

    // Execute tool calls
    const observations: string[] = [];

    for (const call of toolCalls) {
      if (totalToolCalls >= config.loop.max_tool_calls) {
        observations.push(`[LIMIT] Max tool calls (${config.loop.max_tool_calls}) reached.`);
        break;
      }

      // HITL check for risky operations
      if (onHITL && config.loop.hitl_threshold < 1.0) {
        const riskyPatterns = ["rollback.restore", "terminal.run", "hid.click"];
        const isRisky = riskyPatterns.some(p => call.name.includes(p.split(".")[1] || ""));
        if (isRisky) {
          const approved = await onHITL(call.name, 0.8);
          if (!approved) {
            observations.push(`[HITL] Action '${call.name}' rejected by user.`);
            continue;
          }
        }
      }

      onToolCall?.(call.name, call.args);

      try {
        const result = await toolRouter.execute(call.name, call.args as Record<string, unknown>);
        const obs = `[${call.name}] → ${JSON.stringify(result).slice(0, 300)}`;
        observations.push(obs);

        session.tool_calls.push({
          tool: call.name,
          args: call.args,
          result,
          ts: new Date().toISOString(),
        });
        totalToolCalls++;
      } catch (e) {
        const errMsg = `[${call.name}] ERROR: ${e instanceof Error ? e.message : String(e)}`;
        observations.push(errMsg);
      }
    }

    // Add observations as user message for next iteration
    const obsMessage = observations.join("\n");
    session.messages.push({ role: "user", content: `Observations:\n${obsMessage}` });
    saveSession(session);
  }

  // 8. Check if max iterations reached
  if (session.iterations >= config.loop.max_iterations && session.status === "running") {
    session.status = "error";
    lastResponse = `[MAX_ITERATIONS] Agent ${agentName} reached limit of ${config.loop.max_iterations} iterations.`;
    saveSession(session);
  }

  // 9. Store experience in vault (async, non-blocking)
  try {
    const { ask } = await import("../model_router.js");
    const summaryResult = await ask(
      `Résume en 1 phrase cette interaction agent: "${userInput.slice(0, 100)}"`,
      { role: "worker", timeout: 10000 }
    );
    // Best-effort vault store — failure is non-fatal
    void fetch("http://localhost:3000/api/vault/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: userInput.slice(0, 200),
        result: summaryResult.text,
        success: session.status === "completed",
        agent: agentName,
      }),
    }).catch(() => {});
  } catch { /* non-fatal */ }

  return {
    sessionId: session.id,
    response: lastResponse,
    iterations: session.iterations,
    tool_calls_count: totalToolCalls,
    status: session.status,
  };
}
