/**
 * apps/ghost-daemon/src/platforms/macos.js
 *
 * Implémentation macOS — délègue entièrement vers les agents Python Chimera :
 *   - Perception (Bee :8002) pour observe() et screenshot()
 *   - Executor   (Bee :8004) pour act()
 *
 * Les URLs sont configurables via variables d'environnement :
 *   PYTHON_PERCEPTION_URL=http://localhost:8002  (défaut)
 *   PYTHON_EXECUTOR_URL=http://localhost:8004    (défaut)
 */

const PERCEPTION_BASE = process.env.PYTHON_PERCEPTION_URL || 'http://localhost:8002';
const EXECUTOR_BASE   = process.env.PYTHON_EXECUTOR_URL   || 'http://localhost:8004';

// ─── Observe — arbre d'accessibilité + état écran ─────────────────────────────

/**
 * Appelle l'agent Perception pour analyser l'écran macOS courant.
 * Retourne les éléments UI accessibles (boutons, champs, menus…).
 *
 * @param {object} options  - { app?: string, roles?: string[] }
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function observe(options = {}) {
  const res = await jsonPost(`${PERCEPTION_BASE}/analyze`, {
    app:   options.app   || null,
    roles: options.roles || null,
  });
  return res;
}

// ─── Act — exécute une action via Executor ────────────────────────────────────

/**
 * Mappe les types d'actions Ghost vers les endpoints de l'Executor Python :
 *   click    → POST :8004/mouse_click   { x, y, button }
 *   type     → POST :8004/type_text     { text }
 *   key      → POST :8004/key_press     { key }
 *   open_app → POST :8004/open_app      { app_name }
 *
 * @param {object} action  - { type: string, params?: object }
 *                           Alias legacy aussi supportés :
 *                             type_text, press_key, mouse_click, open_application
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function act(action) {
  const { type, params = {} } = action;

  // Table de mapping : type d'action → endpoint Executor + transformation du body
  const endpoints = {
    // Actions standards Ghost
    click:     { path: '/mouse_click', body: p => ({ x: p.x, y: p.y, button: p.button || 'left' }) },
    type:      { path: '/type_text',   body: p => ({ text: p.value || p.text || '' }) },
    key:       { path: '/key_press',   body: p => ({ key:  p.value || p.key  || '' }) },
    open_app:  { path: '/open_app',    body: p => ({ app_name: p.target || p.app_name || '' }) },

    // Alias legacy (compatibilité ghost-os-ultimate)
    mouse_click:      { path: '/mouse_click', body: p => ({ x: p.x, y: p.y, button: p.button || 'left' }) },
    type_text:        { path: '/type_text',   body: p => ({ text: p.text || '' }) },
    press_key:        { path: '/key_press',   body: p => ({ key: p.key || '' }) },
    open_application: { path: '/open_app',    body: p => ({ app_name: p.app_name || p.target || '' }) },
  };

  const entry = endpoints[type];
  if (!entry) {
    return { success: false, error: `Action macOS inconnue: "${type}"` };
  }

  return jsonPost(`${EXECUTOR_BASE}${entry.path}`, entry.body(params));
}

// ─── Screenshot — capture PNG via Perception ──────────────────────────────────

/**
 * Demande une capture d'écran à l'agent Perception.
 *
 * @param {object} options  - { path?: string, format?: 'png'|'jpg' }
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function screenshot(options = {}) {
  const res = await jsonPost(`${PERCEPTION_BASE}/screenshot`, {
    path:   options.path   || null,
    format: options.format || 'png',
  });
  return res;
}

// ─── Utilitaire interne ───────────────────────────────────────────────────────

/**
 * POST JSON vers un agent Python Chimera avec timeout de sécurité (15 s).
 */
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
