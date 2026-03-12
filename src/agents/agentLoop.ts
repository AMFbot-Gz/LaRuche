/**
 * agentLoop.ts - LaRuche Agent Loop
 * PicoClaw-inspired: intake -> context -> LLM -> tool calls -> memory -> persist
 *
 * Supports: operator | devops | builder | planner agents
 * Provider-agnostic via src/llm/provider.ts
 * Tool-agnostic via src/tools/toolRouter.ts
 */

import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { parse as parseYaml } from "../utils/yaml.js";
import { LLMProvider, Message, ToolCall } from "../llm/provider.js";
import { ToolRouter } from "../tools/toolRouter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../");

// Timeout HITL : auto-rejet après N secondes (configurable via .env)
const HITL_TIMEOUT_MS = parseInt(process.env.HITL_TIMEOUT_SEC ?? "60") * 1000;

// --- Risk Map ----------------------------------------------------------------

/**
 * Niveau de risque par outil logique (0.0 = sûr, 1.0 = critique).
 * Basé sur la classification tools dans config/agents.yml.
 * Les outils inconnus reçoivent un risque moyen (0.5) par précaution.
 */
const TOOL_RISK_MAP: Record<string, number> = {
  // HID — contrôle physique de l'OS
  "hid.move":       0.5,
  "hid.click":      0.5,
  "hid.type":       0.6,
  "hid.scroll":     0.2,
  "hid.screenshot": 0.1,
  "hid.calibrate":  0.0,

  // Terminal — exécution de commandes
  "terminal.run":   0.9,  // irréversible potentiel
  "terminal.safe":  0.7,
  "terminal.ps":    0.0,

  // Vision — lecture seule
  "vision.analyze": 0.1,
  "vision.find":    0.1,
  "vision.cursor":  0.0,

  // Rollback — manipulation d'état système
  "rollback.restore": 0.95, // irréversible
  "rollback.snap":    0.3,
  "rollback.list":    0.0,

  // Janitor — suppression de fichiers
  "janitor.purge":  0.7,
  "janitor.gc":     0.2,
  "janitor.stats":  0.0,

  // Vault — mémoire (lecture/écriture)
  "vault.store":    0.1,
  "vault.search":   0.0,
  "vault.profile":  0.0,
  "vault.rule":     0.3,

  // Skills — création/évolution
  "skill.create":   0.2,
  "skill.evolve":   0.4,
  "skill.list":     0.0,

  // Browser / Playwright
  "os.openApp":     0.3,
  "os.focusApp":    0.1,
  "browser.goto":   0.2,
  "pw.launch":      0.2,
  "pw.goto":        0.2,
  "pw.click":       0.4,
  "pw.fill":        0.5,
  "pw.evaluate":    0.7,  // eval JS arbitraire
  "pw.close":       0.1,
};

/**
 * Retourne le niveau de risque d'un outil.
 * Outil inconnu → 0.5 (risque moyen, prudence par défaut).
 */
function getToolRisk(toolName: string): number {
  return TOOL_RISK_MAP[toolName] ?? 0.5;
}

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
    hitl_threshold: number; // 0.0 to 1.0 — niveau de risque déclenchant le HITL
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
    const configPath = join(ROOT, `config/agents/${name}.yaml`);
    if (!existsSync(configPath)) {
      throw new Error(`Agent configuration not found: ${configPath}`);
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
5. If an action is rejected by the operator, adapt your approach — find a safer alternative.
`.trim();
  }

  /**
   * Demande une approbation humaine (HITL) avant d'exécuter un outil risqué.
   *
   * - Si onHITL est fourni : attend sa réponse (Promise<boolean>)
   * - Timeout après HITL_TIMEOUT_MS → rejet automatique
   * - Si onHITL absent → rejet automatique immédiat (safe by default)
   */
  private async requestHITL(
    toolName: string,
    args: any,
    risk: number,
    onHITL?: (tool: string, args: any, risk: number) => Promise<boolean>
  ): Promise<boolean> {
    if (!onHITL) {
      console.warn(
        `[HITL] "${toolName}" (risk=${risk.toFixed(2)}) — pas de handler, rejet automatique`
      );
      return false;
    }

    const timeout = new Promise<boolean>((resolve) =>
      setTimeout(() => {
        console.warn(`[HITL] "${toolName}" — timeout après ${HITL_TIMEOUT_MS / 1000}s, rejet automatique`);
        resolve(false);
      }, HITL_TIMEOUT_MS)
    );

    return Promise.race([onHITL(toolName, args, risk), timeout]);
  }

  async run(
    userInput: string,
    opts: {
      onIteration?: (n: number) => void;
      onToken?: (t: string) => void;
      onToolCall?: (tool: string, args: any) => void;
      onThought?: (t: string) => void;
      /** Callback HITL — retourner true pour approuver, false pour rejeter. */
      onHITL?: (tool: string, args: any, risk: number) => Promise<boolean>;
    } = {}
  ): Promise<AgentResponse> {
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

          // ── HITL : vérification du risque avant exécution ─────────────────
          const risk = getToolRisk(call.name);

          if (risk >= this.config.loop.hitl_threshold) {
            console.log(
              `[HITL] Approbation requise pour "${call.name}" (risk=${risk.toFixed(2)}, threshold=${this.config.loop.hitl_threshold})`
            );

            const approved = await this.requestHITL(
              call.name,
              call.args,
              risk,
              opts.onHITL
            );

            if (!approved) {
              // Injecter le rejet comme résultat d'outil
              // → le modèle peut s'adapter et proposer une alternative
              this.messages.push({
                role: "tool",
                toolCallId: call.id,
                content: JSON.stringify({
                  error: "HITL_REJECTED",
                  message: `L'action "${call.name}" a été refusée par l'opérateur. Adaptez votre approche et proposez une alternative moins risquée.`
                })
              });
              // Ne pas exécuter l'outil — continuer la boucle
              continue;
            }
          }
          // ──────────────────────────────────────────────────────────────────

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
 * Point d'entrée principal pour agentBridge.js
 */
export async function runAgentLoop(opts: {
  agentName: string;
  userInput: string;
  onToken?: (t: string) => void;
  onToolCall?: (tool: string, args: any) => void;
  onThought?: (t: string) => void;
  /** Callback HITL — retourner true pour approuver, false pour rejeter. */
  onHITL?: (tool: string, args: any, risk: number) => Promise<boolean>;
}) {
  const loop = new AgentLoop(opts.agentName);
  return await loop.run(opts.userInput, opts);
}
