import { execSync } from "child_process";

const ALLOWED_PREFIXES = ["ls", "cat", "echo", "git", "npm", "node", "python3", "curl", "find", "grep", "head", "tail", "wc", "pwd", "df", "du", "ps", "which", "env", "printenv"];

export async function run({ command = "", cwd = process.cwd(), timeout = 10000 } = {}) {
  const cmd = command.trim();
  const prefix = cmd.split(/\s+/)[0];
  if (!ALLOWED_PREFIXES.includes(prefix)) {
    return { success: false, error: `Commande non autorisée: ${prefix}. Autorisées: ${ALLOWED_PREFIXES.join(", ")}` };
  }
  try {
    const output = execSync(cmd, { cwd, timeout, encoding: "utf8", maxBuffer: 1024 * 1024 });
    return { success: true, output: output.slice(0, 4000), command: cmd };
  } catch (e) {
    return { success: false, error: e.stderr || e.message, command: cmd };
  }
}
