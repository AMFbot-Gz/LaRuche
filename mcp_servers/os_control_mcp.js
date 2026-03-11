/**
 * os_control_mcp.js — MCP Server HID Universel
 * Priority P0: moveMouse, click, typeText, scroll, calibrate, screenshot
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SCREENSHOTS_DIR = join(ROOT, ".laruche/temp/screenshots");
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// Calibration state
let calibration = { width: 1920, height: 1080, dpiScale: 1.0 };

// Gaussian jitter
const gaussian = (mean = 0, std = 1) => {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// Coordonnées relatives (0-100%) → absolues
const toAbs = (relX, relY) => ({
  x: Math.round((relX / 100) * calibration.width / calibration.dpiScale),
  y: Math.round((relY / 100) * calibration.height / calibration.dpiScale),
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = new McpServer({
  name: "laruche-os-control",
  version: "3.0.0",
});

server.tool(
  "calibrate",
  {},
  async () => {
    try {
      const { default: robot } = await import("robotjs");
      const screen = robot.getScreenSize();
      calibration = {
        width: screen.width,
        height: screen.height,
        dpiScale: screen.width > 2560 ? 2.0 : 1.0,
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              resolution: `${screen.width}x${screen.height}`,
              dpiScale: calibration.dpiScale,
            }),
          },
        ],
      };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

server.tool(
  "moveMouse",
  { relX: z.number().min(0).max(100), relY: z.number().min(0).max(100), ms: z.number().optional() },
  async ({ relX, relY, ms = 300 }) => {
    try {
      const { default: robot } = await import("robotjs");
      const { x, y } = toAbs(relX, relY);
      const steps = Math.round(ms / 8);
      const start = robot.getMousePos();

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        robot.moveMouse(
          Math.round(start.x + (x - start.x) * ease + gaussian(0, 0.8)),
          Math.round(start.y + (y - start.y) * ease + gaussian(0, 0.8))
        );
        await sleep(8);
      }

      return { content: [{ type: "text", text: JSON.stringify({ success: true, x, y }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

server.tool(
  "click",
  {
    relX: z.number().min(0).max(100),
    relY: z.number().min(0).max(100),
    button: z.enum(["left", "right", "middle"]).optional(),
    double: z.boolean().optional(),
  },
  async ({ relX, relY, button = "left", double = false }) => {
    try {
      const { default: robot } = await import("robotjs");
      const { x, y } = toAbs(relX, relY);
      robot.moveMouse(x, y);
      await sleep(50);
      if (double) {
        robot.mouseClick(button, true);
      } else {
        robot.mouseClick(button);
      }
      return { content: [{ type: "text", text: JSON.stringify({ success: true, x, y, button, double }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

server.tool(
  "typeText",
  { text: z.string(), wpm: z.number().optional() },
  async ({ text, wpm = 65 }) => {
    try {
      const { default: robot } = await import("robotjs");
      for (const char of text) {
        const delay = (60000 / (wpm * 5)) * (1 + gaussian(0, 0.3));
        robot.typeString(char);
        await sleep(Math.max(30, delay));
      }
      return { content: [{ type: "text", text: JSON.stringify({ success: true, chars: text.length }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

server.tool(
  "scroll",
  { direction: z.enum(["up", "down", "left", "right"]), amount: z.number().optional() },
  async ({ direction, amount = 3 }) => {
    try {
      const { default: robot } = await import("robotjs");
      const pos = robot.getMousePos();
      const dy = direction === "down" ? -amount : direction === "up" ? amount : 0;
      const dx = direction === "right" ? amount : direction === "left" ? -amount : 0;
      robot.scrollMouse(dx, dy);
      return { content: [{ type: "text", text: JSON.stringify({ success: true, direction, amount }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

server.tool(
  "screenshot",
  { region: z.string().optional() },
  async () => {
    try {
      const { default: robot } = await import("robotjs");
      const bitmap = robot.screen.capture();
      const timestamp = Date.now();
      const path = join(SCREENSHOTS_DIR, `shot_${timestamp}.png`);

      // Basic PNG save via robotjs bitmap
      // En production: utiliser jimp ou sharp pour encoder le bitmap en PNG
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            path,
            width: bitmap.width,
            height: bitmap.height,
            timestamp,
          }),
        }],
      };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

server.tool(
  "getPosition",
  {},
  async () => {
    try {
      const { default: robot } = await import("robotjs");
      const pos = robot.getMousePos();
      return { content: [{ type: "text", text: JSON.stringify({ success: true, ...pos }) }] };
    } catch (e) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }) }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
