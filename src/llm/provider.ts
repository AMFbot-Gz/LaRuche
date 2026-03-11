/**
 * provider.ts — Provider-agnostic LLM client for LaRuche
 *
 * Supported now: Ollama (local)
 * Ready for: Anthropic, OpenAI, Kimi, OpenRouter (env-gated)
 */

import { AgentConfig } from "../agents/agentLoop.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  usage?: { input_tokens: number; output_tokens: number };
}

interface ProviderConfig {
  host?: string;
  api_key?: string;
  base_url?: string;
  default_model?: string;
  timeout_ms: number;
  enabled?: string;
}

// ─── Provider resolution ──────────────────────────────────────────────────────

// Expand ${ENV_VAR:-default} patterns in config values
function expandEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    const [varName, defaultVal] = expr.split(":-");
    return process.env[varName] ?? defaultVal ?? "";
  });
}

function resolveProviderConfig(providerName: string): ProviderConfig {
  // Built-in defaults (fallback if config/agents.yml not loaded)
  const defaults: Record<string, ProviderConfig> = {
    ollama: {
      host: process.env.OLLAMA_HOST || "http://localhost:11434",
      timeout_ms: 60000,
      enabled: "true",
    },
    anthropic: {
      api_key: process.env.ANTHROPIC_API_KEY || "",
      base_url: "https://api.anthropic.com/v1",
      default_model: "claude-sonnet-4-20250514",
      timeout_ms: 30000,
      enabled: process.env.ANTHROPIC_ENABLED || "false",
    },
    openai: {
      api_key: process.env.OPENAI_API_KEY || "",
      base_url: "https://api.openai.com/v1",
      default_model: "gpt-4o-mini",
      timeout_ms: 30000,
      enabled: process.env.OPENAI_ENABLED || "false",
    },
    kimi: {
      api_key: process.env.KIMI_API_KEY || "",
      base_url: "https://api.moonshot.cn/v1",
      default_model: "moonshot-v1-8k",
      timeout_ms: 45000,
      enabled: process.env.KIMI_ENABLED || "false",
    },
    openrouter: {
      api_key: process.env.OPENROUTER_API_KEY || "",
      base_url: "https://openrouter.ai/api/v1",
      default_model: "meta-llama/llama-3.2-3b-instruct",
      timeout_ms: 30000,
      enabled: process.env.OPENROUTER_ENABLED || "false",
    },
  };
  return defaults[providerName] || defaults.ollama;
}

// ─── LLM Provider class ───────────────────────────────────────────────────────

export class LLMProvider {
  private agentConfig: AgentConfig;

  constructor(agentConfig: AgentConfig) {
    this.agentConfig = agentConfig;
  }

  // Resolve model string, e.g. "ollama://llama3.2" or "anthropic://claude-sonnet"
  private resolveModel(spec: { provider: string; model: string }): { provider: string; model: string } {
    const model = expandEnv(spec.model);
    return { provider: spec.provider, model };
  }

  // ─── Ollama ───────────────────────────────────────────────────────────────

  private async ollamaComplete(
    messages: Message[],
    model: string,
    temperature: number,
    timeout_ms: number
  ): Promise<string> {
    const cfg = resolveProviderConfig("ollama");
    const host = cfg.host!;

    // Convert to Ollama chat format
    const prompt = messages.map(m => {
      if (m.role === "system") return `System: ${m.content}`;
      if (m.role === "user") return `User: ${m.content}`;
      return `Assistant: ${m.content}`;
    }).join("\n\n") + "\n\nAssistant:";

    const res = await fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature },
      }),
      signal: AbortSignal.timeout(timeout_ms),
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json() as { response: string };
    return data.response || "";
  }

  private async *ollamaStream(
    messages: Message[],
    model: string,
    temperature: number
  ): AsyncGenerator<string> {
    const cfg = resolveProviderConfig("ollama");
    const prompt = messages.map(m => {
      if (m.role === "system") return `System: ${m.content}`;
      if (m.role === "user") return `User: ${m.content}`;
      return `Assistant: ${m.content}`;
    }).join("\n\n") + "\n\nAssistant:";

    const res = await fetch(`${cfg.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: true, options: { temperature } }),
    });

    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const j = JSON.parse(line) as { response?: string; done?: boolean };
          if (j.response) yield j.response;
          if (j.done) return;
        } catch { /* partial JSON */ }
      }
    }
  }

  // ─── OpenAI-compatible (Anthropic, OpenAI, Kimi, OpenRouter) ─────────────

  private async openaiComplete(
    messages: Message[],
    providerName: string,
    model: string,
    temperature: number,
    timeout_ms: number
  ): Promise<string> {
    const cfg = resolveProviderConfig(providerName);
    if (!cfg.api_key || cfg.enabled === "false") {
      throw new Error(`Provider ${providerName} not configured (ENABLED=false or no API key)`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.api_key}`,
    };

    // Anthropic uses x-api-key
    if (providerName === "anthropic") {
      headers["x-api-key"] = cfg.api_key!;
      headers["anthropic-version"] = "2023-06-01";
      delete headers["Authorization"];
    }

    // Separate system from messages for providers that require it
    const systemMsg = messages.find(m => m.role === "system");
    const chatMessages = messages.filter(m => m.role !== "system");

    const body: Record<string, unknown> = {
      model,
      messages: chatMessages,
      temperature,
      max_tokens: 4096,
      stream: false,
    };

    if (systemMsg && providerName === "anthropic") {
      body.system = systemMsg.content;
    } else if (systemMsg) {
      body.messages = messages; // OpenAI supports system in messages array
    }

    const res = await fetch(`${cfg.base_url}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout_ms),
    });

    if (!res.ok) throw new Error(`${providerName} HTTP ${res.status}: ${await res.text()}`);

    const data = await res.json() as {
      content?: Array<{ text: string }>;
      choices?: Array<{ message: { content: string } }>;
    };

    // Anthropic format
    if (data.content?.[0]?.text) return data.content[0].text;
    // OpenAI format
    if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;

    throw new Error(`Unexpected response format from ${providerName}`);
  }

  // ─── Public interface ─────────────────────────────────────────────────────

  async complete(messages: Message[], useFallback = false): Promise<string> {
    const spec = useFallback ? this.agentConfig.llm.fallback : this.agentConfig.llm.primary;
    const { provider, model } = this.resolveModel(spec);
    const { temperature, timeout_ms } = this.agentConfig.llm;

    if (provider === "ollama") {
      return this.ollamaComplete(messages, model, temperature, timeout_ms);
    }

    return this.openaiComplete(messages, provider, model, temperature, timeout_ms);
  }

  async *stream(messages: Message[]): AsyncGenerator<string> {
    const spec = this.agentConfig.llm.primary;
    const { provider, model } = this.resolveModel(spec);

    if (provider === "ollama") {
      yield* this.ollamaStream(messages, model, this.agentConfig.llm.temperature);
    } else {
      // Non-streaming fallback for cloud providers
      const result = await this.complete(messages);
      yield result;
    }
  }
}
