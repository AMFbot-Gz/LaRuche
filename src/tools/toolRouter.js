/**
 * toolRouter.js — Router d'outils minimal pour agentLoop v4.1
 * Les outils réels passent par intentPipeline + MCP servers
 */

export class ToolRouter {
  constructor({ allowed = [], refused = [] } = {}) {
    // Liste vide = tous autorisés (sauf refused)
    this.allowed = allowed;
    this.refused = new Set(refused);
  }

  /**
   * Exécute un outil.
   * @param {string} toolName
   * @param {object} args
   * @returns {Promise<{success: boolean, result?: any, error?: string}>}
   */
  async call(toolName, args = {}) {
    if (this.refused.has(toolName)) {
      return {
        success: false,
        error: `Tool "${toolName}" refusé par configuration agent`,
      };
    }
    // Vérification liste blanche (si non vide)
    if (this.allowed.length > 0 && !this.allowed.includes(toolName)) {
      return {
        success: false,
        error: `Tool "${toolName}" non autorisé (pas dans allowed_tools)`,
      };
    }
    // Stub — les vrais tools sont branchés via intentPipeline + MCP
    return { success: true, result: null, _stub: true, tool: toolName };
  }
}
