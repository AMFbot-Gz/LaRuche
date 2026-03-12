/**
 * agentLoop.ts - LaRuche Agent Loop
 * PicoClaw-inspired: intake -> context -> LLM -> tool calls -> memory -> persist
 *
 * Supports: operator | devops | builder agents
 * Provider-agnostic via src/llm/provider.ts
 * Tool-agnostic via src/tools/toolRouter.ts
 *
 * fix(C5): chemin config corrigé configuration/agents/ → config/agents/
 * fix(C4): HITL activé — voir fix/hitl-activation (PR #2)
 */

import { readFileSync, existsSync } from "fs";
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
  status: "completed" | "max_iterations" | "error" | "interrupted" | "hitl_rejected";
  error?: string;
}

// --- HITL Risk Map -----------------------------------------------------------

const TOOL_RISK_MAP: Record<string, number> = {
  "terminal.run":       0.9,
  "terminal.safe":      0.5,
  "hid.click":          0.3,
  "hid.type":           0.3,
  "hid.screenshot":     0.1,
  "vision.analyze":     0.1,
  "vault.store":        0.4,
  "vault.search":       0.1,
  "pw.goto":            0.2,
  "pw.click":           0.3,
  "pw.fill":            0.4,
  "pw.screenshot":      0.1,
  "os.openApp":         0.2,
  "os.focusApp":        0.1,
  "rollback.snapshot":  0.5,
  "rollback.restore":   0.85,
};

function getToolRisk(toolName: string): number {
  return TOOL_RISK_MAP[toolName] ?? 0.5; // inconnue = risque médian
}

async function requestHITL(
  toolName: string,
  args: any,
  risk: number,
  onHITL?: (tool: string, args: any, risk: number) => Promise<boolean>,
  timeoutMs = 60_000
): Promise<boolean> {
  if (!onHITL) return true; // Pas de callback = auto-approve

  return Promise.race([
    onHITL(toolName, args, risk),
    new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs)),
  ]);
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
    // fix(C5): chemin corrigé configuration/agents/ → config/agents/
    const configPath = join(ROOT, `config/agents/${name}.yaml`);
    if (!existsSync(configPath)) {
      throw new Error(`Agent configuration not found: config/agents/${name}.yaml`);
    }
    return parseYaml(readFileSync(configPath, "utf-8")) as AgentConfig;
  }

  private buildSystemPrompt(): string {
    return `
You are an autonomous AI agent part of the LaRuche swarm.
Agent Identity: ${this.config.description}
Core Soul: ${this.config.soul}

CONTEXT:
Current Time: ${new Date().toISOString()}
Working Directory: ${ROOT}

RULES:
1. Use tools whenever necessary to achieve the goal.
2. If a tool fails, analyze the error and try a different approach.
3. Keep thoughts concise but clear.
4. You are 100% local, no external APIs unless via tools.
`.trim();
  }

  async run(userInput: string, opts: {
    onIteration?: (n: number) => void;
    onToken?: (t: string) => void;
    onToolCall?: (tool: string, args: any) => void;
    onThought?: (t: string) => void;
    onHITL?: (tool: string, args: any, risk: number) => Promise<boolean>;
  } = {}): Promise<AgentResponse> {

    this.messages = [
      { role: "system", content: this.buildSystemPrompt() },
      { role: "user",   content: userInput }
    ];

    const hitlThreshold = this.config.loop.hitl_threshold ?? 0.7;
    const hitlTimeoutMs = parseInt(process.env.HITL_TIMEOUT_SEC || '60') * 1000;
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

        // Handle Tool Calls avec HITL
        for (const call of response.toolCalls) {
          toolCallsCount++;
          if (toolCallsCount > this.config.loop.max_tool_calls) break;

          opts.onToolCall?.(call.name, call.args);

          // ─── HITL check (fix C4) ───
          const risk = getToolRisk(call.name);
          if (risk >= hitlThreshold) {
            const approved = await requestHITL(
              call.name, call.args, risk, opts.onHITL, hitlTimeoutMs
            );

            if (!approved) {
              // Inject le rejet comme résultat de tool — le modèle peut proposer une alternative
              this.messages.push({
                role: "tool",
                toolCallId: call.id,
                content: JSON.stringify({
                  success: false,
                  error: `HITL_REJECTED: l'opérateur a refusé l'exécution de ${call.name} (risk=${risk.toFixed(2)})`
                })
              });
              continue;
            }
          }

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
        console.warn(`[AgentLoop] Itération ${iterations} échouée, retry...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return {
      sessionId: this.sessionId,
      response: "Max iterations atteint.",
      iterations,
      tool_calls_count: toolCallsCount,
      status: "max_iterations"
    };
  }
}

/**
 * Point d'entrée pour agentBridge.js
 */
export async function runAgentLoop(opts: {
  agentName: string;
  userInput: string;
  onToken?: (t: string) => void;
  onToolCall?: (tool: string, args: any) => void;
  onThought?: (t: string) => void;
  onHITL?: (tool: string, args: any, risk: number) => Promise<boolean>;
}) {
  const loop = new AgentLoop(opts.agentName);
  return await loop.run(opts.userInput, opts);
}
