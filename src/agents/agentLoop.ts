/**
 * agentLoop.ts - LaRuche Agent Loop
 * PicoClaw-inspired: intake -> context -> LLM -> tool calls -> memory -> persist
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
const ROOT = join(__dirname, "../../");

// --- Types -------------------------------------------------------------------

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
    hitl_threshold: number; // 0.0 to 1.0 (risk level to trigger HITL)
    batch_hid?: boolean;
    batch_terminal?: boolean;
    thought_chain?: boolean;
    vision_limit?: number;
    retry_on_error: number;
  };
  allowed_tools: string[];
  refused_tools: string[];
  memory: {
    load_global: boolean;
    load_agent_specific: boolean;
    max_entries: number;
  };
}

export interface AgentResponse {
  sessionId: string;
  response: string;
  iterations: number;
  tool_calls_count: number;
  status: "completed" | "max_iterations" | "error" | "interrupted";
  error?: string;
}

// --- Implementation ----------------------------------------------------------

class AgentLoop {
  private config: AgentConfig;
  private provider: LLMProvider;
  private toolRouter: ToolRouter;
  private messages: Message[] = [];
  private sessionId: string;

  constructor(agentName: string) {
    this.sessionId = randomUUID();
    this.config = this.loadConfig(agentName);
    this.provider = new LLMProvider(this.config.llm);
    this.toolRouter = new ToolRouter({
      allowed: this.config.allowed_tools,
      refused: this.config.refused_tools
    });
  }

  private loadConfig(name: string): AgentConfig {
    const configPath = join(ROOT, `configuration/agents/${name}.yaml`);
    if (!existsSync(configPath)) {
      throw new Error(`Agent configuration not found: ${name}`);
    }
    return parseYaml(readFileSync(configPath, "utf-8")) as AgentConfig;
  }

  private buildSystemPrompt(): string {
    const timestamp = new Date().toISOString();
    return `
You are an autonomous AI agent part of the LaRuche swarm.
Agent Identity: ${this.config.description}
Core Soul: ${this.config.soul}

CONTEXT:
Current Time: ${timestamp}
Working Directory: ${ROOT}

RULES:
1. Use tools whenever necessary to achieve the goal.
2. If a tool fails, analyze the error and try a different approach.
3. Keep thoughts concise but clear.
4. You are 100% local, no external APIs unless via tools.
`.trim();
  }

  async run(userInput: string, opts: any = {}): Promise<AgentResponse> {
    this.messages = [
      { role: "system", content: this.buildSystemPrompt() },
      { role: "user", content: userInput }
    ];

    let iterations = 0;
    let toolCallsCount = 0;

    while (iterations < this.config.loop.max_iterations) {
      iterations++;
      opts.onIteration?.(iterations);

      try {
        const response = await this.provider.generate(this.messages, {
          temperature: this.config.llm.temperature,
          timeout: this.config.llm.timeout_ms
        });

        if (response.thought && this.config.loop.thought_chain) {
          opts.onThought?.(response.thought);
        }

        if (response.content) {
          opts.onToken?.(response.content);
          this.messages.push({ role: "assistant", content: response.content });
        }

        if (!response.toolCalls || response.toolCalls.length === 0) {
          return {
            sessionId: this.sessionId,
            response: response.content || "",
            iterations,
            tool_calls_count: toolCallsCount,
            status: "completed"
          };
        }

        // Handle Tool Calls
        for (const call of response.toolCalls) {
          toolCallsCount++;
          if (toolCallsCount > this.config.loop.max_tool_calls) break;

          opts.onToolCall?.(call.name, call.args);

          const toolResult = await this.toolRouter.call(call.name, call.args);
          this.messages.push({
            role: "tool",
            toolCallId: call.id,
            content: JSON.stringify(toolResult)
          });
        }

      } catch (error: any) {
        if (iterations >= this.config.loop.retry_on_error) {
           return {
            sessionId: this.sessionId,
            response: "",
            iterations,
            tool_calls_count: toolCallsCount,
            status: "error",
            error: error.message
          };
        }
        console.warn(`[AgentLoop] Iteration ${iterations} failed, retrying...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return {
      sessionId: this.sessionId,
      response: "Max iterations reached.",
      iterations,
      tool_calls_count: toolCallsCount,
      status: "max_iterations"
    };
  }
}

/**
 * Main entry point for the bridge.
 */
export async function runAgentLoop(opts: {
  agentName: string;
  userInput: string;
  onToken?: (t: string) => void;
  onToolCall?: (tool: string, args: any) => void;
  onThought?: (t: string) => void;
}) {
  const loop = new AgentLoop(opts.agentName);
  return await loop.run(opts.userInput, opts);
}
