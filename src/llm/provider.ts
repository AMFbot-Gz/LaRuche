/**
 * provider.ts - Provider-agnostic LLM client for LaRuche
 *
 * Chaîne de fallback : Ollama → Anthropic → OpenAI → Kimi → OpenRouter
 * Activation cloud : *_ENABLED=true dans .env + clé API correspondante
 */

import type { AgentConfig } from "../agents/agentLoop.js";

// --- Types -------------------------------------------------------------------

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
}

export interface LLMResponse {
  content: string;
  thought?: string;
  model: string;
  provider: string;
  toolCalls?: ToolCall[];
  usage?: { input_tokens: number; output_tokens: number };
}

// --- Utilitaires -------------------------------------------------------------

/** Remplace ${VAR:-default} par la valeur d'env ou le défaut. */
function expandEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    const [varName, defaultVal] = expr.split(":-");
    return process.env[varName] ?? defaultVal ?? "";
  });
}

/**
 * Normalise les tool_calls de n'importe quel provider vers le format interne.
 * Gère les formats Anthropic (tool_use blocks) et OpenAI (tool_calls array).
 */
function normalizeToolCalls(
  raw: any[] | undefined,
  format: "ollama" | "anthropic" | "openai"
): ToolCall[] | undefined {
  if (!raw || raw.length === 0) return undefined;

  if (format === "ollama") {
    return raw.map((tc: any) => ({
      id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: tc.function.name,
      args: tc.function.arguments
    }));
  }

  if (format === "anthropic") {
    // Anthropic retourne des content blocks de type "tool_use"
    return raw
      .filter((b: any) => b.type === "tool_use")
      .map((b: any) => ({
        id: b.id,
        name: b.name,
        args: b.input
      }));
  }

  if (format === "openai") {
    // OpenAI / Kimi / OpenRouter : format tool_calls standard
    return raw.map((tc: any) => ({
      id: tc.id || `call_${Date.now()}`,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments ?? "{}")
    }));
  }

  return undefined;
}

// --- LLMProvider -------------------------------------------------------------

export class LLMProvider {
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  /**
   * Génère une réponse LLM.
   *
   * Construit dynamiquement la chaîne de fallback :
   * 1. primary (config agent)
   * 2. fallback (config agent)
   * 3. providers cloud activés via .env (*_ENABLED=true)
   *
   * Essaie chaque provider dans l'ordre. Passe au suivant sur toute erreur.
   * Lève une erreur finale si tous les providers échouent.
   */
  async generate(
    messages: Message[],
    options: { temperature?: number; timeout?: number } = {}
  ): Promise<LLMResponse> {
    const chain = this.buildProviderChain();
    let lastError: Error | null = null;

    for (const { provider, model } of chain) {
      try {
        switch (provider) {
          case "ollama":      return await this.callOllama(messages, model, options);
          case "anthropic":  return await this.callAnthropic(messages, model, options);
          case "openai":     return await this.callOpenAI(messages, model, options);
          case "kimi":       return await this.callKimi(messages, model, options);
          case "openrouter": return await this.callOpenRouter(messages, model, options);
          default:
            console.warn(`[LLMProvider] Provider inconnu ignoré: ${provider}`);
        }
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[LLMProvider] ${provider}/${model} a échoué — passage au suivant. (${err.message})`
        );
      }
    }

    throw lastError ?? new Error("Tous les providers LLM de la chaîne ont échoué.");
  }

  /**
   * Construit la chaîne de providers dans l'ordre de priorité :
   * primary → fallback config → providers .env activés
   */
  private buildProviderChain(): Array<{ provider: string; model: string }> {
    const chain: Array<{ provider: string; model: string }> = [];
    const seen = new Set<string>();

    const add = (provider: string, model: string) => {
      const key = `${provider}::${model}`;
      if (!seen.has(key)) {
        chain.push({ provider, model });
        seen.add(key);
      }
    };

    // 1. Primary et fallback depuis la config de l'agent
    if (this.config.primary) {
      add(this.config.primary.provider, this.config.primary.model);
    }
    if (this.config.fallback) {
      add(this.config.fallback.provider, this.config.fallback.model);
    }

    // 2. Providers cloud activés via .env (dans l'ordre du .env.example)
    const cloudProviders: Array<{ env: string; name: string }> = [
      { env: "ANTHROPIC",  name: "anthropic" },
      { env: "OPENAI",     name: "openai" },
      { env: "KIMI",       name: "kimi" },
      { env: "OPENROUTER", name: "openrouter" },
    ];

    for (const { env, name } of cloudProviders) {
      if (
        process.env[`${env}_ENABLED`] === "true" &&
        process.env[`${env}_API_KEY`]
      ) {
        add(name, this.getDefaultModel(name));
      }
    }

    return chain;
  }

  /** Modèles par défaut (selon config/agents.yml). */
  private getDefaultModel(provider: string): string {
    const defaults: Record<string, string> = {
      anthropic:  "claude-sonnet-4-20250514",
      openai:     "gpt-4o-mini",
      kimi:       "moonshot-v1-8k",
      openrouter: "meta-llama/llama-3.2-3b-instruct",
    };
    return defaults[provider] ?? "unknown";
  }

  // --- Providers --------------------------------------------------------------

  /** Ollama — LLM local (défaut). */
  private async callOllama(
    messages: Message[],
    model: string,
    options: any
  ): Promise<LLMResponse> {
    const host = process.env.OLLAMA_HOST || "http://localhost:11434";

    const response = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          tool_call_id: m.toolCallId
        })),
        stream: false,
        options: { temperature: options.temperature ?? 0.7 }
      }),
      signal: AbortSignal.timeout(options.timeout || 30000)
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const message = data.message;

    // Extraction des <thought> tags (chain-of-thought)
    let content: string = message.content || "";
    let thought: string | undefined;
    const thoughtMatch = content.match(/<thought>([\s\S]*?)<\/thought>/);
    if (thoughtMatch) {
      thought = thoughtMatch[1].trim();
      content = content.replace(/<thought>[\s\S]*?<\/thought>/, "").trim();
    }

    return {
      content,
      thought,
      model: data.model,
      provider: "ollama",
      toolCalls: normalizeToolCalls(message.tool_calls, "ollama"),
      usage: {
        input_tokens: data.prompt_eval_count || 0,
        output_tokens: data.eval_count || 0
      }
    };
  }

  /** Anthropic Claude — fallback cloud #1. */
  private async callAnthropic(
    messages: Message[],
    model: string,
    options: any
  ): Promise<LLMResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY manquant");

    // Anthropic sépare le system prompt des messages
    const systemMsg = messages.find(m => m.role === "system")?.content;
    const chatMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        // Anthropic n'accepte pas le role "tool" — on le remplace par "user"
        role: m.role === "tool" ? "user" as const : m.role as "user" | "assistant",
        content: m.role === "tool"
          ? `[Tool result for ${m.toolCallId}]: ${m.content}`
          : m.content
      }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: options.temperature ?? 0.7,
        ...(systemMsg ? { system: systemMsg } : {}),
        messages: chatMessages
      }),
      signal: AbortSignal.timeout(options.timeout || 60000)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic HTTP ${response.status}: ${err}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: any) => b.type === "text");
    const content = textBlock?.text ?? "";

    return {
      content,
      model: data.model,
      provider: "anthropic",
      toolCalls: normalizeToolCalls(data.content, "anthropic"),
      usage: {
        input_tokens: data.usage?.input_tokens ?? 0,
        output_tokens: data.usage?.output_tokens ?? 0
      }
    };
  }

  /** OpenAI — fallback cloud #2. */
  private async callOpenAI(
    messages: Message[],
    model: string,
    options: any
  ): Promise<LLMResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY manquant");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0.7,
        messages: messages
          .filter(m => m.role !== "tool")
          .map(m => ({ role: m.role, content: m.content }))
      }),
      signal: AbortSignal.timeout(options.timeout || 60000)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";

    return {
      content,
      model: data.model,
      provider: "openai",
      toolCalls: normalizeToolCalls(choice?.message?.tool_calls, "openai"),
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0
      }
    };
  }

  /** Kimi (Moonshot AI) — fallback cloud #3. API compatible OpenAI. */
  private async callKimi(
    messages: Message[],
    model: string,
    options: any
  ): Promise<LLMResponse> {
    const apiKey = process.env.KIMI_API_KEY;
    if (!apiKey) throw new Error("KIMI_API_KEY manquant");

    const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0.7,
        messages: messages
          .filter(m => m.role !== "tool")
          .map(m => ({ role: m.role, content: m.content }))
      }),
      signal: AbortSignal.timeout(options.timeout || 45000)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Kimi HTTP ${response.status}: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";

    return {
      content,
      model: data.model ?? model,
      provider: "kimi",
      toolCalls: normalizeToolCalls(choice?.message?.tool_calls, "openai"),
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0
      }
    };
  }

  /** OpenRouter — fallback cloud #4. Proxy multi-modèles, API compatible OpenAI. */
  private async callOpenRouter(
    messages: Message[],
    model: string,
    options: any
  ): Promise<LLMResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY manquant");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/AMFbot-Gz/LaRuche",
        "X-Title": "LaRuche"
      },
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0.7,
        messages: messages
          .filter(m => m.role !== "tool")
          .map(m => ({ role: m.role, content: m.content }))
      }),
      signal: AbortSignal.timeout(options.timeout || 30000)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter HTTP ${response.status}: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? "";

    return {
      content,
      model: data.model ?? model,
      provider: "openrouter",
      toolCalls: normalizeToolCalls(choice?.message?.tool_calls, "openai"),
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0
      }
    };
  }
}
