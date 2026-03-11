/**
 * hud/main.js — Ghost-Monitor HUD LaRuche
 * Fenêtre Electron transparente, always-on-top, click-through
 * WebSocket port 9001 ← flux temps réel depuis queen.js
 */

const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const { WebSocketServer } = require("ws");
const path = require("path");

let win = null;
let wss = null;

app.whenReady().then(() => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  win = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // CRITIQUE: rend la fenêtre traversable par les clics
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, "src/index.html"));

  // Ctrl+Shift+H → Toggle visibilité HUD
  globalShortcut.register("Ctrl+Shift+H", () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
    }
  });

  // Ctrl+Shift+Space → Toggle mode interactif (pour HITL)
  globalShortcut.register("Ctrl+Shift+Space", () => {
    const isIgnoring = win.isIgnoreMouseEventsEnabled?.() ?? true;
    win.setIgnoreMouseEvents(!isIgnoring, { forward: true });
    win.setFocusable(isIgnoring);
    if (isIgnoring) win.focus();
  });

  // WebSocket Server — Port 9001 — Flux temps réel depuis queen.js
  wss = new WebSocketServer({ port: 9001 });
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());
        // Transmet l'événement au renderer React
        if (win && !win.isDestroyed()) {
          win.webContents.send("hud-event", event);
        }
      } catch {}
    });

    // Confirme la connexion
    ws.send(JSON.stringify({ type: "connected", ts: Date.now() }));
  });

  console.log("🐝 LaRuche HUD actif — Port WS 9001");
});

// IPC pour HITL (Human-in-the-Loop)
ipcMain.on("hitl-response", (event, { approved, missionId }) => {
  // Diffuser la réponse HITL à tous les clients WS
  wss?.clients.forEach((ws) => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "hitl_response", approved, missionId }));
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  wss?.close();
});
