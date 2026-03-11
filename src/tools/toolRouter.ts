/**
 * toolRouter.ts — LaRuche Tool Router
 *
 * Routes tool calls (name + args) to:
 *   1. MCP servers (via HTTP to running MCP processes)
 *   2. Local scripts (optional, for GPIO/I2C/etc.)
 *   3. Direct module calls (for performance-critical paths)
 *
 * Access control: tools_allowed / tools_denied from agent config.
 */

import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── MCP endpoint registry ────────────────────────────────────────────────────
// Maps MCP server names → their stdio command to spawn

const MCP_SERVERS: Record<string, { command: string; args: string[] }> = {
  "mcp-os-control":    { command: "node", args: ["mcp_servers/os_control_mcp.js"] },
  "mcp-terminal":      { command: "node", args: ["mcp_servers/terminal_mcp.js"] },
  "mcp-vision":        { command: "node", args: ["mcp_servers/vision_mcp.js"] },
  "mcp-vault":         { command: "node", args: ["mcp_servers/vault_mcp.js"] },
  "mcp-skill-factory": { command: "node", args: ["mcp_servers/skill_factory_mcp.js"] },
  "mcp-rollback":      { command: "node", args: ["mcp_servers/rollback_mcp.js"] },
  "mcp-janitor":       { command: "node", args: ["mcp_servers/janitor_mcp.js"] },
};

// Tool name → MCP server + function mapping (from config/agents.yml tools section)
const TOOL_MAP: Record<string, { mcp: string; fn: string }> = {
  // HID
  "hid.move":         { mcp: "mcp-os-control", fn: "moveMouse" },
  "hid.click":        { mcp: "mcp-os-control", fn: "click" },
  "hid.type":         { mcp: "mcp-os-control", fn: "typeText" },
  "hid.scroll":       { mcp: "mcp-os-control", fn: "scroll" },
  "hid.screenshot":   { mcp: "mcp-os-control", fn: "screenshot" },
  "hid.calibrate":    { mcp: "mcp-os-control", fn: "calibrate" },
  // Vision
  "vision.analyze":   { mcp: "mcp-vision", fn: "analyzeScreen" },
  "vision.find":      { mcp: "mcp-vision", fn: "findElement" },
  "vision.cursor":    { mcp: "mcp-vision", fn: "identifyCursorTarget" },
  // Terminal
  "terminal.run":     { mcp: "mcp-terminal", fn: "exec" },
  "terminal.safe":    { mcp: "mcp-terminal", fn: "execSafe" },
  "terminal.ps":      { mcp: "mcp-terminal", fn: "listProcesses" },
  // Vault
  "vault.store":      { mcp: "mcp-vault", fn: "storeExperience" },
  "vault.search":     { mcp: "mcp-vault", fn: "findSimilar" },
  "vault.profile":    { mcp: "mcp-vault", fn: "getProfile" },
  "vault.rule":       { mcp: "mcp-vault", fn: "addRule" },
  // Skills
  "skill.create":     { mcp: "mcp-skill-factory", fn: "createSkill" },
  "skill.evolve":     { mcp: "mcp-skill-factory", fn: "evolveSkill" },
  "skill.list":       { mcp: "mcp-skill-factory", fn: "listSkills" },
  // Rollback
  "rollback.snap":    { mcp: "mcp-rollback", fn: "createSnapshot" },
  "rollback.list":    { mcp: "mcp-rollback", fn: "listSnapshots" },
  "rollback.restore": { mcp: "mcp-rollback", fn: "restore" },
  // Janitor
  "janitor.purge":    { mcp: "mcp-janitor", fn: "purgeTemp" },
  "janitor.gc":       { mcp: "mcp-janitor", fn: "gcRAM" },
  "janitor.stats":    { mcp: "mcp-janitor", fn: "getStats" },
};

// ─── Access control ───────────────────────────────────────────────────────────

function matchesPattern(toolName: string, pattern: string): boolean {
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return toolName.startsWith(prefix + ".");
  }
  return toolName === pattern;
}

function checkAccess(toolName: string, allowed: string[], denied: string[]): void {
  // Check denied first
  for (const pattern of denied) {
    if (matchesPattern(toolName, pattern)) {
      throw new Error(`Tool '${toolName}' is denied for this agent (pattern: ${pattern})`);
    }
  }
  // Check allowed
  for (const pattern of allowed) {
    if (matchesPattern(toolName, pattern)) return;
  }
  throw new Error(`Tool '${toolName}' is not in the allowed list for this agent`);
}

// ─── MCP caller via JSON-RPC over stdio ───────────────────────────────────────

// Cache for MCP responses to avoid re-spawning for identical calls
const _mcpCache = new Map<string, { result: unknown; ts: number }>();
const MCP_CACHE_TTL = 5000; // 5s cache for idempotent read operations

const CACHEABLE_TOOLS = new Set(["skill.list", "vault.profile", "janitor.stats", "terminal.ps"]);

async function callMCPTool(
  mcpName: string,
  fnName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const cacheKey = `${mcpName}:${fnName}:${JSON.stringify(args)}`;

  // Check cache for read-only operations
  if (CACHEABLE_TOOLS.has(`${mcpName.replace("mcp-", "")}.${fnName}`)) {
    const cached = _mcpCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < MCP_CACHE_TTL) {
      return cached.result;
    }
  }

  const server = MCP_SERVERS[mcpName];
  if (!server) throw new Error(`Unknown MCP server: ${mcpName}`);

  // JSON-RPC 2.0 request
  const rpcRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: fnName, arguments: args },
  });

  const { stdout } = await execa(server.command, [...server.args], {
    input: rpcRequest,
    cwd: ROOT,
    timeout: 30000,
    reject: false,
  });

  let result: unknown;
  try {
    const rpcResponse = JSON.parse(stdout) as {
      result?: { content: Array<{ text: string }> };
      error?: { message: string };
    };

    if (rpcResponse.error) throw new Error(rpcResponse.error.message);

    const text = rpcResponse.result?.content?.[0]?.text;
    result = text ? JSON.parse(text) : rpcResponse.result;
  } catch {
    result = { raw: stdout.slice(0, 500) };
  }

  // Cache result
  _mcpCache.set(cacheKey, { result, ts: Date.now() });

  return result;
}

// ─── Script runner ────────────────────────────────────────────────────────────

async function callScript(
  scriptPath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const fullPath = join(ROOT, scriptPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  const isNode = scriptPath.endsWith(".js") || scriptPath.endsWith(".ts");
  const isPython = scriptPath.endsWith(".py");

  const cmd = isNode ? "node" : isPython ? "python3" : "bash";
  const argsStr = JSON.stringify(args);

  const { stdout } = await execa(cmd, [fullPath, argsStr], {
    cwd: ROOT,
    timeout: 15000,
    reject: false,
  });

  try {
    return JSON.parse(stdout);
  } catch {
    return { output: stdout };
  }
}

// ─── ToolRouter class ─────────────────────────────────────────────────────────

export class ToolRouter {
  private allowedPatterns: string[];
  private deniedPatterns: string[];

  constructor(allowed: string[], denied: string[]) {
    this.allowedPatterns = allowed;
    this.deniedPatterns = denied;
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    // 1. Access control
    checkAccess(toolName, this.allowedPatterns, this.deniedPatterns);

    // 2. Route to MCP
    const toolSpec = TOOL_MAP[toolName];
    if (toolSpec) {
      return callMCPTool(toolSpec.mcp, toolSpec.fn, args);
    }

    // 3. Route to script (for future GPIO/I2C/etc.)
    if (toolName.startsWith("script.")) {
      const scriptName = toolName.replace("script.", "");
      const scriptPath = `scripts/${scriptName}`;
      return callScript(scriptPath, args);
    }

    throw new Error(`No route found for tool: ${toolName}`);
  }

  listAvailable(): string[] {
    return Object.keys(TOOL_MAP).filter(tool =>
      this.allowedPatterns.some(p => matchesPattern(tool, p)) &&
      !this.deniedPatterns.some(p => matchesPattern(tool, p))
    );
  }
}
