/**
 * pencil_mcp.js — MCP Server pour Pencil.app (Chimera v6)
 * Contrôle Pencil.app via AppleScript et URL scheme.
 *
 * Outils : open_app · new_document · open_file · screenshot ·
 *          get_windows · click_menu · export_png · close_app · focus_window
 *
 * Démarrage : node --import tsx apps/queen/src/mcp_servers/pencil_mcp.js
 */

import { McpServer }          from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z }                  from "zod";
import { exec }               from "child_process";
import { promisify }          from "util";
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname }      from "path";
import { fileURLToPath }      from "url";

const execAsync   = promisify(exec);
const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, "../../..");  // apps/queen
const MONOREPO    = join(ROOT, "../..");           // chimera root
const SHOTS_DIR   = join(MONOREPO, ".chimera/temp/screenshots");
const TMP_AS      = join(MONOREPO, ".chimera/temp/pencil_tmp.scpt");

mkdirSync(SHOTS_DIR, { recursive: true });

const APP_NAME = "Pencil";
const APP_PATH = "/Applications/Pencil.app";

// ─── AppleScript helpers ──────────────────────────────────────────────────────

async function runAS(script) {
  const dir = join(MONOREPO, ".chimera/temp");
  mkdirSync(dir, { recursive: true });
  writeFileSync(TMP_AS, script, "utf8");
  const { stdout, stderr } = await execAsync(`osascript "${TMP_AS}"`);
  try { unlinkSync(TMP_AS); } catch { /* ignore */ }
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

async function isPencilRunning() {
  try {
    const { stdout } = await execAsync(`pgrep -x "${APP_NAME}" 2>/dev/null || echo ""`);
    return stdout.trim().length > 0;
  } catch { return false; }
}

async function activate() {
  await runAS(`tell application "${APP_NAME}" to activate`);
}

// ─── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name:        "chimera-pencil",
  version:     "2.0.0",
  description: "Contrôle Pencil.app (prototypage/wireframing) via AppleScript",
});

const ok  = (data) => ({ content: [{ type: "text", text: JSON.stringify({ success: true,  ...data }) }] });
const err = (msg)  => ({ content: [{ type: "text", text: JSON.stringify({ success: false, error: String(msg) }) }] });

// open_app
server.tool("open_app", "Ouvre ou active Pencil.app.", {}, async () => {
  try {
    if (await isPencilRunning()) {
      await activate();
      return ok({ action: "activated", message: "Pencil mis au premier plan." });
    }
    await execAsync(`open -a "${APP_PATH}"`);
    let ready = false;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await isPencilRunning()) { ready = true; break; }
    }
    return ok({ action: "launched", ready });
  } catch (e) { return err(e.message); }
});

// new_document
server.tool("new_document", "Crée un nouveau document Pencil (⌘N).", {}, async () => {
  try {
    if (!await isPencilRunning()) {
      await execAsync(`open -a "${APP_PATH}"`);
      await new Promise(r => setTimeout(r, 3000));
    }
    await runAS(`
      tell application "${APP_NAME}" to activate
      tell application "System Events"
        tell process "${APP_NAME}"
          keystroke "n" using command down
        end tell
      end tell
    `);
    return ok({ message: "Nouveau document créé." });
  } catch (e) { return err(e.message); }
});

// open_file
server.tool(
  "open_file",
  "Ouvre un fichier .pen / .epgz dans Pencil.",
  { path: z.string().describe("Chemin absolu du fichier") },
  async ({ path: filePath }) => {
    try {
      if (!existsSync(filePath)) return err(`Fichier introuvable: ${filePath}`);
      await execAsync(`open -a "${APP_PATH}" "${filePath}"`);
      await new Promise(r => setTimeout(r, 1500));
      return ok({ message: `Ouvert: ${filePath}` });
    } catch (e) { return err(e.message); }
  }
);

// screenshot
server.tool(
  "screenshot",
  "Capture la fenêtre Pencil active. Retourne le chemin PNG.",
  { filename: z.string().optional() },
  async ({ filename }) => {
    try {
      if (!await isPencilRunning()) return err("Pencil n'est pas ouvert.");
      await activate();
      await new Promise(r => setTimeout(r, 300));
      const name    = filename || `pencil_${Date.now()}`;
      const outPath = join(SHOTS_DIR, `${name}.png`);
      await execAsync(`screencapture -x "${outPath}"`);
      return ok({ path: outPath });
    } catch (e) { return err(e.message); }
  }
);

// get_windows
server.tool("get_windows", "Liste les fenêtres Pencil ouvertes.", {}, async () => {
  try {
    if (!await isPencilRunning()) return ok({ running: false, windows: [] });
    const { stdout } = await runAS(`
      set winList to {}
      tell application "${APP_NAME}"
        repeat with w in windows
          set end of winList to name of w
        end repeat
      end tell
      return winList
    `);
    const windows = stdout ? stdout.split(", ").filter(Boolean) : [];
    return ok({ running: true, count: windows.length, windows });
  } catch (e) { return err(e.message); }
});

// click_menu
server.tool(
  "click_menu",
  "Clique sur un item de menu Pencil.",
  {
    menu:    z.string(),
    item:    z.string(),
    submenu: z.string().optional(),
  },
  async ({ menu, item, submenu }) => {
    try {
      if (!await isPencilRunning()) return err("Pencil n'est pas ouvert.");
      await activate();
      const script = submenu
        ? `tell application "System Events"
             tell process "${APP_NAME}"
               click menu item "${submenu}" of menu "${menu}" of menu bar 1
               click menu item "${item}" of menu 1 of menu item "${submenu}" of menu "${menu}" of menu bar 1
             end tell
           end tell`
        : `tell application "System Events"
             tell process "${APP_NAME}"
               click menu item "${item}" of menu "${menu}" of menu bar 1
             end tell
           end tell`;
      await runAS(script);
      return ok({ message: `Cliqué: ${menu} > ${submenu ? submenu + " > " : ""}${item}` });
    } catch (e) { return err(e.message); }
  }
);

// export_png
server.tool(
  "export_png",
  "Exporte le document courant en PNG (File > Export).",
  { output_dir: z.string().optional() },
  async ({ output_dir }) => {
    try {
      if (!await isPencilRunning()) return err("Pencil n'est pas ouvert.");
      await activate();
      await runAS(`
        tell application "System Events"
          tell process "${APP_NAME}"
            keystroke "e" using {command down, shift down}
          end tell
        end tell
      `);
      const dir = output_dir || `${process.env.HOME}/Desktop`;
      return ok({ message: `Export déclenché. Dossier cible: ${dir}` });
    } catch (e) { return err(e.message); }
  }
);

// close_app
server.tool(
  "close_app",
  "Ferme Pencil (⌘Q). force=true → kill -9.",
  { force: z.boolean().optional() },
  async ({ force = false }) => {
    try {
      if (!await isPencilRunning()) return ok({ message: "Pencil n'était pas ouvert." });
      if (force) {
        await execAsync(`pkill -x "${APP_NAME}" 2>/dev/null || true`);
      } else {
        await runAS(`tell application "${APP_NAME}" to quit`);
      }
      return ok({ action: force ? "force_killed" : "quit" });
    } catch (e) { return err(e.message); }
  }
);

// focus_window
server.tool("focus_window", "Met Pencil au premier plan.", {}, async () => {
  try {
    if (!await isPencilRunning()) return err("Pencil n'est pas ouvert.");
    await runAS(`tell application "${APP_NAME}" to activate`);
    return ok({ message: "Pencil au premier plan." });
  } catch (e) { return err(e.message); }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
