#!/usr/bin/env node
/**
 * apps/ghost-daemon/src/ghost_daemon.js — Ghost Computer-Use Daemon (adapté Chimera)
 *
 * Serveur HTTP déployé sur chaque machine à contrôler.
 * Expose une API standard que le Ghost Core (Queen :3000) appelle via DaemonClientAdapter.
 * Délègue vers les agents Python Chimera :
 *   - Perception → http://localhost:8002
 *   - Executor   → http://localhost:8004
 *
 * Routes :
 *   GET  /health      → ping + machine info
 *   POST /observe     → arbre d'accessibilité + état écran
 *   POST /act         → exécute une action (click, type, open_app…)
 *   POST /screenshot  → capture PNG (base64 ou chemin)
 *   POST /wait        → attend une condition
 *
 * Configuration (.env) :
 *   MACHINE_ID=mac-local
 *   DAEMON_PORT=9000
 *   DAEMON_SECRET=  (vide = pas d'auth, acceptable en LAN)
 *   GHOST_CORE_URL=http://localhost:3000  (optionnel — pour enregistrement auto auprès de Queen)
 *   DAEMON_IMPL=macos  (macos | linux | windows | stub)
 *   PYTHON_PERCEPTION_URL=http://localhost:8002
 *   PYTHON_EXECUTOR_URL=http://localhost:8004
 *   NEURAL_BUS_URL=http://localhost:3000/api/events  (NeuralEventBus → Queen)
 *
 * Usage :
 *   node src/ghost_daemon.js
 *   DAEMON_IMPL=stub node src/ghost_daemon.js   (test sans vrai OS)
 */

import http            from 'http';
import { URL }         from 'url';
import os              from 'os';
import { existsSync }  from 'fs';
import path            from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────

// Charger .env si présent (sans dépendance dotenv)
const envFile = path.join(__dirname, '../../.env');
if (existsSync(envFile)) {
  const lines = (await import('fs')).readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const MACHINE_ID      = process.env.MACHINE_ID        || os.hostname();
const PORT            = parseInt(process.env.DAEMON_PORT || '9000', 10);
const SECRET          = process.env.DAEMON_SECRET      || '';
const IMPL            = process.env.DAEMON_IMPL        || detectImpl();
const NEURAL_BUS_URL  = process.env.NEURAL_BUS_URL     || 'http://localhost:3000/api/events';

function detectImpl() {
  switch (process.platform) {
    case 'darwin':  return 'macos';
    case 'linux':   return 'linux';
    case 'win32':   return 'windows';
    default:        return 'stub';
  }
}

// ─── Logger ──────────────────────────────────────────────────────────────────

const log = {
  info:  (...a) => console.log( `[${ts()}] INFO `, ...a),
  warn:  (...a) => console.warn(`[${ts()}] WARN `, ...a),
  error: (...a) => console.error(`[${ts()}] ERROR`, ...a),
};
function ts() { return new Date().toISOString().slice(11, 23); }

// ─── NeuralEventBus — émission d'événements vers Queen ───────────────────────

/**
 * Émet un événement vers le NeuralEventBus de Queen (Queen Node.js :3000).
 * Non bloquant : les erreurs sont loggées mais n'interrompent pas le flux principal.
 *
 * @param {string} type  - Type d'événement (ex: 'daemon.observe', 'daemon.act')
 * @param {object} data  - Données de l'événement
 */
async function emitToNeuralBus(type, data) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000); // timeout court : non bloquant
    await fetch(NEURAL_BUS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        type,
        machine_id: MACHINE_ID,
        timestamp:  new Date().toISOString(),
        data,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    // Non critique — Queen peut être temporairement indisponible
    log.warn(`NeuralEventBus inaccessible: ${err.message}`);
  }
}

// ─── Implémentations OS ───────────────────────────────────────────────────────

/**
 * Chaque impl expose :
 *   observe(options)       → ObserveData
 *   act(action)            → ActionData
 *   screenshot(options)    → ScreenshotData
 *   waitFor(cond, timeout) → WaitData
 */

// ── macOS — délègue vers agents Python Chimera ────────────────────────────────
// Import dynamique pour éviter une dépendance circulaire au chargement
const { observe: macObserve, act: macAct, screenshot: macScreenshot } =
  await import('./platforms/macos.js');

const macos = {
  async observe(options = {}) {
    // Appelle la couche Perception :8002 via macos.js
    return macObserve(options);
  },

  async act(action) {
    // Délègue vers Executor :8004 via macos.js
    return macAct(action);
  },

  async screenshot(options = {}) {
    return macScreenshot(options);
  },

  async waitFor(condition, timeoutMs = 10000) {
    // Polling via observe jusqu'à trouver la condition ou timeout
    const deadline = Date.now() + timeoutMs;
    const interval = condition.params?.interval_ms || 500;
    while (Date.now() < deadline) {
      const obs = await this.observe({ app: condition.params?.app });
      if (obs.success && obs.data?.elements) {
        const found = obs.data.elements.some(el =>
          (el.title || '').toLowerCase().includes((condition.params?.query || '').toLowerCase())
        );
        if (found) return {
          success: true,
          data: { found: true, elapsed_ms: Date.now() - (deadline - timeoutMs) },
        };
      }
      await sleep(interval);
    }
    return { success: false, error: 'waitFor timeout', data: { found: false } };
  },
};

// ── Linux (xdotool + AT-SPI2 + scrot) ────────────────────────────────────────
const linux = {
  async observe(_opts) {
    return { success: false, error: 'Linux observe: non implémenté (brancher AT-SPI2)' };
  },
  async act(action) {
    const { type, params = {} } = action;
    if (type === 'type_text') {
      return exec_cmd(['xdotool', 'type', '--delay', '50', params.text || '']);
    }
    if (type === 'click') {
      return exec_cmd(['xdotool', 'mousemove', String(params.x), String(params.y), 'click', '1']);
    }
    if (type === 'press_key') {
      const key = mapKey_linux(params.key);
      return exec_cmd(['xdotool', 'key', key]);
    }
    if (type === 'screenshot') {
      return exec_cmd(['scrot', params.path || '/tmp/ghost_shot.png']);
    }
    return { success: false, error: `Linux act: "${type}" non implémenté` };
  },
  async screenshot(opts) {
    const filePath = opts.path || '/tmp/ghost_shot.png';
    return exec_cmd(['scrot', filePath]);
  },
  async waitFor(_cond, _timeout) {
    return { success: false, error: 'Linux waitFor: non implémenté' };
  },
};

// ── Windows (pyautogui / UIA) ─────────────────────────────────────────────────
const windows = {
  async observe(_opts) {
    return { success: false, error: 'Windows observe: non implémenté (brancher UIA)' };
  },
  async act(action) {
    const { type, params = {} } = action;
    if (type === 'type_text') {
      return exec_cmd(['python', '-c', `import pyautogui; pyautogui.write(${JSON.stringify(params.text)}, interval=0.05)`]);
    }
    if (type === 'click') {
      return exec_cmd(['python', '-c', `import pyautogui; pyautogui.click(${params.x}, ${params.y})`]);
    }
    return { success: false, error: `Windows act: "${type}" non implémenté` };
  },
  async screenshot(opts) {
    const filePath = opts.path || 'C:\\Temp\\ghost_shot.png';
    return exec_cmd(['python', '-c', `import pyautogui; pyautogui.screenshot(${JSON.stringify(filePath)})`]);
  },
  async waitFor(_cond, _timeout) {
    return { success: false, error: 'Windows waitFor: non implémenté' };
  },
};

// ── Stub (tests / CI) ─────────────────────────────────────────────────────────
const stub = {
  async observe(_opts) {
    return {
      success: true,
      data: {
        app:      'StubApp',
        elements: [
          { role: 'button',    title: 'OK',     x: 100, y: 200, width: 80,  height: 30, confidence: 1.0 },
          { role: 'textField', title: 'Search', x:  50, y:  50, width: 300, height: 30, confidence: 1.0 },
        ],
        elements_count: 2,
        resolution: { width: 1920, height: 1080 },
      },
    };
  },
  async act(action) {
    log.info(`STUB act: ${action.type}`, action.params);
    return { success: true, data: { stub: true, action: action.type } };
  },
  async screenshot(opts) {
    return { success: true, data: { path: opts.path || '/tmp/stub.png', stub: true } };
  },
  async waitFor(cond, _timeout) {
    return { success: true, data: { found: true, condition: cond.type, stub: true } };
  },
};

// Sélection de l'implémentation
const IMPLS = { macos, linux, windows, stub };
const impl  = IMPLS[IMPL] || stub;
log.info(`Daemon impl: ${IMPL} (machine: ${MACHINE_ID})`);

// ─── Serveur HTTP ─────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data',  chunk => { data += chunk; });
    req.on('end',   () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type':   'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function authOk(req) {
  if (!SECRET) return true; // Pas de secret → tout passe (LAN)
  const h = req.headers['x-ghost-secret'] || '';
  return h === SECRET;
}

async function handleRequest(req, res) {
  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const route  = url.pathname;
  const method = req.method.toUpperCase();

  if (!authOk(req)) return send(res, 401, { success: false, error: 'Unauthorized' });

  // ── GET /health ──────────────────────────────────────────────────────────────
  if (method === 'GET' && route === '/health') {
    return send(res, 200, {
      success:    true,
      machine_id: MACHINE_ID,
      platform:   process.platform,
      impl:       IMPL,
      uptime_s:   Math.floor(process.uptime()),
      memory_mb:  Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp:  new Date().toISOString(),
      version:    '1.0.0',
    });
  }

  // ── POST /observe ────────────────────────────────────────────────────────────
  if (method === 'POST' && route === '/observe') {
    const body   = await readBody(req);
    const t0     = Date.now();
    const result = await impl.observe(body.options || {});
    // Émet vers NeuralEventBus (non bloquant)
    emitToNeuralBus('daemon.observe', { options: body.options, result });
    return send(res, 200, { ...result, machine_id: MACHINE_ID, duration_ms: Date.now() - t0 });
  }

  // ── POST /act ────────────────────────────────────────────────────────────────
  if (method === 'POST' && route === '/act') {
    const body   = await readBody(req);
    const action = body.action;
    if (!action?.type) return send(res, 400, { success: false, error: 'action.type requis' });
    const t0     = Date.now();
    log.info(`act: ${action.type}`, JSON.stringify(action.params || {}));
    const result = await impl.act(action);
    // Émet vers NeuralEventBus (non bloquant)
    emitToNeuralBus('daemon.act', { action, result });
    return send(res, 200, { ...result, machine_id: MACHINE_ID, duration_ms: Date.now() - t0 });
  }

  // ── POST /screenshot ─────────────────────────────────────────────────────────
  if (method === 'POST' && route === '/screenshot') {
    const body   = await readBody(req);
    const t0     = Date.now();
    const result = await impl.screenshot(body.options || {});
    emitToNeuralBus('daemon.screenshot', { options: body.options, result });
    return send(res, 200, { ...result, machine_id: MACHINE_ID, duration_ms: Date.now() - t0 });
  }

  // ── POST /wait ───────────────────────────────────────────────────────────────
  if (method === 'POST' && route === '/wait') {
    const body      = await readBody(req);
    const condition = body.condition;
    const timeout   = body.timeout_ms || 10000;
    if (!condition) return send(res, 400, { success: false, error: 'condition requis' });
    const t0     = Date.now();
    const result = await impl.waitFor(condition, timeout);
    emitToNeuralBus('daemon.wait', { condition, result });
    return send(res, 200, { ...result, machine_id: MACHINE_ID, duration_ms: Date.now() - t0 });
  }

  return send(res, 404, { success: false, error: `Route inconnue: ${method} ${route}` });
}

// ─── Utils ────────────────────────────────────────────────────────────────────

async function jsonPost(url, body) {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res   = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  ctrl.signal,
    });
    clearTimeout(timer);
    return res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function exec_cmd(args) {
  const { execFileSync } = await import('child_process');
  try {
    const stdout = execFileSync(args[0], args.slice(1), { timeout: 15000 }).toString().trim();
    return { success: true, data: { stdout } };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function mapKey_linux(key) {
  const map = {
    Return: 'Return', Escape: 'Escape', Tab: 'Tab',
    Space: 'space', 'Cmd+C': 'ctrl+c', 'Cmd+V': 'ctrl+v',
  };
  return map[key] || key.toLowerCase();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Auto-enregistrement auprès de Queen (Ghost Core) ────────────────────────

async function registerWithCore() {
  const coreUrl = process.env.GHOST_CORE_URL;
  if (!coreUrl) return;
  try {
    const res = await fetch(`${coreUrl}/api/machines/register`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.CHIMERA_SECRET || ''}`,
      },
      body: JSON.stringify({
        machine_id:  MACHINE_ID,
        platform:    process.platform,
        daemon_url:  `http://${os.hostname()}:${PORT}`,
        daemon_port: PORT,
      }),
    });
    if (res.ok) log.info(`Enregistré auprès de Queen: ${coreUrl}`);
    else        log.warn(`Enregistrement Queen échoué: ${res.status}`);
  } catch (err) {
    log.warn(`Queen inaccessible (${coreUrl}): ${err.message}`);
  }
}

// ─── Démarrage ────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    log.error('Erreur handler:', err.message);
    send(res, 500, { success: false, error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  log.info(`Ghost Daemon démarré`);
  log.info(`  machine_id    : ${MACHINE_ID}`);
  log.info(`  impl          : ${IMPL}`);
  log.info(`  port          : ${PORT}`);
  log.info(`  auth          : ${SECRET ? 'oui (X-Ghost-Secret)' : 'non (LAN mode)'}`);
  log.info(`  NeuralEventBus: ${NEURAL_BUS_URL}`);
  log.info(`  Endpoints     : GET /health | POST /observe | POST /act | POST /screenshot | POST /wait`);
  await registerWithCore();
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    log.error(`Port ${PORT} déjà utilisé. Changez DAEMON_PORT.`);
  } else {
    log.error('Serveur:', err.message);
  }
  process.exit(1);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
