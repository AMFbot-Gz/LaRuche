/**
 * os_control_mcp.js — MCP Server HID Universel (Chimera v6)
 * Contrôle souris/clavier/écran via @jitsi/robotjs + jimp (optionnel).
 *
 * Outils : calibrate · moveMouse · click · typeText · scroll · screenshot · getPosition
 */

import { McpServer }          from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z }                  from "zod";
import { join, dirname }      from "path";
import { fileURLToPath }      from "url";
import { mkdirSync }          from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO  = join(__dirname, "../../../..");
const SHOTS_DIR = join(MONOREPO, ".chimera/temp/screenshots");
mkdirSync(SHOTS_DIR, { recursive: true });

// Jimp optionnel
let Jimp = null;
try {
  const mod = await import("jimp");
  Jimp = mod.Jimp || mod.default;
} catch { /* jimp absent — screenshot retournera une erreur utile */ }

// robotjs lazy
let robot = null;
async function getRobot() {
  if (!robot) {
    try {
      const mod = await import("@jitsi/robotjs");
      robot = mod.default || mod;
    } catch { robot = null; }
  }
  return robot;
}

let calibration = { width: 1920, height: 1080, dpiScale: 1.0 };
const sleep  = (ms) => new Promise(r => setTimeout(r, ms));
const gauss  = (mean = 0, std = 1) => mean + std * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const toAbs  = (rx, ry) => ({
  x: Math.round((rx / 100) * calibration.width  / calibration.dpiScale),
  y: Math.round((ry / 100) * calibration.height / calibration.dpiScale),
});

const ok  = (data) => ({ content: [{ type: "text", text: JSON.stringify({ success: true,  ...data }) }] });
const err = (msg)  => ({ content: [{ type: "text", text: JSON.stringify({ success: false, error: String(msg) }) }] });

const server = new McpServer({ name: "chimera-os-control", version: "5.0.0" });

server.tool("calibrate", {}, async () => {
  try {
    const rb = await getRobot();
    if (!rb) return err("HID non disponible (@jitsi/robotjs manquant)");
    const s = rb.getScreenSize();
    calibration = { width: s.width, height: s.height, dpiScale: s.width > 2560 ? 2.0 : 1.0 };
    return ok({ resolution: `${s.width}x${s.height}`, dpiScale: calibration.dpiScale });
  } catch (e) { return err(e.message); }
});

server.tool("moveMouse",
  { relX: z.number().min(0).max(100), relY: z.number().min(0).max(100), ms: z.number().optional() },
  async ({ relX, relY, ms = 300 }) => {
    try {
      const rb = await getRobot();
      if (!rb) return err("HID non disponible");
      const { x, y } = toAbs(relX, relY);
      const steps = Math.max(1, Math.round(ms / 8));
      const start = rb.getMousePos();
      for (let i = 0; i <= steps; i++) {
        const t    = i / steps;
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        rb.moveMouse(
          Math.round(start.x + (x - start.x) * ease + gauss(0, 0.8)),
          Math.round(start.y + (y - start.y) * ease + gauss(0, 0.8)),
        );
        await sleep(8);
      }
      return ok({ x, y });
    } catch (e) { return err(e.message); }
  }
);

server.tool("click",
  { relX: z.number().min(0).max(100), relY: z.number().min(0).max(100), button: z.enum(["left","right","middle"]).optional(), double: z.boolean().optional() },
  async ({ relX, relY, button = "left", double = false }) => {
    try {
      const rb = await getRobot();
      if (!rb) return err("HID non disponible");
      const { x, y } = toAbs(relX, relY);
      rb.moveMouse(x, y);
      await sleep(50);
      rb.mouseClick(button, double);
      return ok({ x, y, button, double });
    } catch (e) { return err(e.message); }
  }
);

server.tool("typeText",
  { text: z.string(), wpm: z.number().optional() },
  async ({ text, wpm = 65 }) => {
    try {
      const rb = await getRobot();
      if (!rb) return err("HID non disponible");
      for (const char of text) {
        const delay = (60000 / (wpm * 5)) * (1 + gauss(0, 0.3));
        rb.typeString(char);
        await sleep(Math.max(30, delay));
      }
      return ok({ chars: text.length });
    } catch (e) { return err(e.message); }
  }
);

server.tool("scroll",
  { direction: z.enum(["up","down","left","right"]), amount: z.number().optional() },
  async ({ direction, amount = 3 }) => {
    try {
      const rb = await getRobot();
      if (!rb) return err("HID non disponible");
      const dy = direction === "down" ? -amount : direction === "up" ? amount : 0;
      const dx = direction === "right" ? amount  : direction === "left" ? -amount : 0;
      rb.scrollMouse(dx, dy);
      return ok({ direction, amount });
    } catch (e) { return err(e.message); }
  }
);

server.tool("screenshot", {}, async () => {
  try {
    const rb = await getRobot();
    if (!rb) return err("HID non disponible");
    const bitmap    = rb.screen.capture();
    const timestamp = Date.now();
    const filePath  = join(SHOTS_DIR, `shot_${timestamp}.png`);

    if (!Jimp) {
      return err("jimp non installé. Faire: pnpm add jimp --filter @chimera/queen");
    }
    const { width, height } = bitmap;
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const s = i * 4;
      rgba[s]     = bitmap.image[s + 2];
      rgba[s + 1] = bitmap.image[s + 1];
      rgba[s + 2] = bitmap.image[s];
      rgba[s + 3] = 255;
    }
    const img = new Jimp({ data: rgba, width, height });
    await img.write(filePath);
    return ok({ path: filePath, width, height, timestamp });
  } catch (e) { return err(e.message); }
});

server.tool("getPosition", {}, async () => {
  try {
    const rb = await getRobot();
    if (!rb) return err("HID non disponible");
    return ok(rb.getMousePos());
  } catch (e) { return err(e.message); }
});

const transport = new StdioServerTransport();
await server.connect(transport);
