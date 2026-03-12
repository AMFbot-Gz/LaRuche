/**
 * smart_click — Clique sur un élément UI par description sémantique
 * Combine find_element (AX tree) + pyautogui.click
 */
import { execFile } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const execFileAsync = promisify(execFile);

export async function run({ query = "", app = "", double = false } = {}) {
  if (!query) {
    return { success: false, error: "Paramètre 'query' requis — ex: 'bouton Envoyer'" };
  }

  const args = [
    "src/accessibility.py", "smart_click",
    "--query", query,
  ];
  if (app) args.push("--app", app);
  if (double) args.push("--double");

  try {
    const { stdout, stderr } = await execFileAsync("python3", args, {
      cwd: ROOT,
      timeout: 15000,
      env: { ...process.env },
    });

    const raw = stdout.trim();
    if (!raw) {
      return { success: false, error: stderr?.trim() || "Pas de réponse" };
    }

    const data = JSON.parse(raw);

    if (data.success) {
      return {
        success: true,
        clicked: data.clicked,
        role: data.role,
        x: data.x,
        y: data.y,
        confidence: data.confidence,
        message: `Cliqué sur "${data.clicked}" (${data.role}) à (${data.x}, ${data.y})`,
      };
    }

    return {
      success: false,
      error: data.error || `Impossible de cliquer sur "${query}"`,
      closest: data.closest?.best_match || null,
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
