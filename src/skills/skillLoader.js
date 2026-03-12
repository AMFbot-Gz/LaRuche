/**
 * skillLoader.js — Chargeur de skills LaRuche
 *
 * Charge les SKILL.md depuis 4 niveaux de priorité :
 *   1. workspace/skills/   (utilisateur, priorité max)
 *   2. .laruche/skills/    (installés via CLI)
 *   3. skills/             (projet LaRuche)
 *   4. BUILTIN_SKILLS      (fallback hardcodé)
 *
 * Exports :
 *   getAllSkills()                  → SkillMeta[]
 *   getSkill(name)                 → SkillMeta | undefined
 *   getRelevantSkills(intent, max) → SkillMeta[] (scoring par pertinence)
 *   reloadSkills()                 → void
 *   formatSkillsForPrompt(skills)  → string
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../");

// ─── Skills builtin (fallback si aucun SKILL.md trouvé pour ce nom) ──────────
const BUILTIN_SKILLS = [
  { name: "open_safari",       description: "Ouvre l'application Safari sur macOS",             tags: ["browser","macos","navigation"], keywords: ["safari","ouvrir"] },
  { name: "open_browser",      description: "Ouvre un navigateur web (Safari ou Chrome)",        tags: ["browser","navigation"],          keywords: ["navigateur","browser"] },
  { name: "go_to_youtube",     description: "Navigue vers YouTube dans le navigateur ouvert",    tags: ["browser","youtube","music"],      keywords: ["youtube"] },
  { name: "search_youtube",    description: "Recherche une vidéo ou playlist sur YouTube",       tags: ["youtube","search","music"],       keywords: ["chercher","youtube","playlist"] },
  { name: "play_first_result", description: "Clique sur le premier résultat YouTube",            tags: ["youtube","play","music"],         keywords: ["jouer","play","premier"] },
  { name: "open_app",          description: "Ouvre une application macOS par son nom",           tags: ["macos","apps"],                   keywords: ["ouvrir","app","application"] },
  { name: "focus_app",         description: "Met le focus sur une application déjà ouverte",     tags: ["macos","apps"],                   keywords: ["focus","fenêtre"] },
  { name: "goto_url",          description: "Navigue vers une URL dans le navigateur",           tags: ["browser","navigation"],           keywords: ["url","aller","naviguer"] },
  { name: "click_element",     description: "Clique sur un élément de la page web",              tags: ["browser","interaction"],          keywords: ["cliquer","click","bouton"] },
  { name: "fill_field",        description: "Remplit un champ de formulaire web",                tags: ["browser","form"],                 keywords: ["remplir","formulaire","champ"] },
  { name: "press_key",         description: "Appuie sur une touche clavier",                     tags: ["keyboard","interaction"],         keywords: ["touche","appuyer"] },
  { name: "take_screenshot",   description: "Prend une capture d'écran",                         tags: ["vision","screenshot"],            keywords: ["screenshot","capture","écran"] },
  { name: "extract_text",      description: "Extrait le texte visible d'une page web",           tags: ["browser","extraction"],           keywords: ["extraire","texte","scraping"] },
  { name: "run_command",       description: "Exécute une commande terminal",                     tags: ["terminal","devops"],              keywords: ["commande","terminal","exécuter"] },
  { name: "type_text",         description: "Tape du texte dans le champ actif",                 tags: ["keyboard","input"],               keywords: ["taper","écrire","texte"] },
  { name: "press_enter",       description: "Appuie sur la touche Entrée",                       tags: ["keyboard"],                       keywords: ["entrée","enter","valider"] },
  { name: "open_vscode",       description: "Ouvre Visual Studio Code",                         tags: ["dev","ide","vscode"],             keywords: ["vscode","code","ide"] },
  { name: "google_search",     description: "Effectue une recherche Google",                     tags: ["browser","search","google"],      keywords: ["google","chercher","recherche"] },
  { name: "code_generation",   description: "Génère du code selon une description",              tags: ["dev","code","generation"],        keywords: ["code","générer","programmer"] },
  { name: "run_code",          description: "Exécute du code dans un terminal",                  tags: ["dev","terminal","execution"],     keywords: ["exécuter","lancer"] },
  { name: "close_app",         description: "Ferme une application macOS",                       tags: ["macos","apps"],                   keywords: ["fermer","quitter","close"] },
  { name: "devops_logs",       description: "Consulte les logs d'un service",                    tags: ["devops","logs","monitoring"],     keywords: ["logs","journaux","monitoring"] },
  { name: "manage_projects",   description: "Gère les projets et dossiers de développement",     tags: ["dev","projects","files"],         keywords: ["projet","dossier","fichier"] },
];

// ─── Cache ──────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 30_000;
let _cache = null;
let _cacheTs = 0;

// ─── Répertoires de skills (par priorité) ───────────────────────────────────
const SKILL_DIRS = [
  { path: join(ROOT, "workspace/skills"), priority: 1 },
  { path: join(ROOT, ".laruche/skills"),  priority: 2 },
  { path: join(ROOT, "skills"),           priority: 3 },
];

// ─── Parser frontmatter YAML (sans dépendance externe) ──────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const yamlStr = match[1];
  const body = match[2].trim();
  const meta = {};
  const lines = yamlStr.split("\n");
  let lastKey = null;

  for (const line of lines) {
    // Clé seule (début de liste multiligne)
    const keyOnly = line.match(/^(\w[\w-]*):\s*$/);
    if (keyOnly) { lastKey = keyOnly[1]; meta[lastKey] = []; continue; }

    // Paire clé: valeur inline
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) {
      const [, key, raw] = kv;
      lastKey = key;
      const val = raw.trim().replace(/^["']|["']$/g, "");
      if (val === "true")         meta[key] = true;
      else if (val === "false")   meta[key] = false;
      else if (/^\d+$/.test(val)) meta[key] = parseInt(val, 10);
      else                        meta[key] = val;
      continue;
    }

    // Item de liste
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && lastKey) {
      if (!Array.isArray(meta[lastKey])) meta[lastKey] = [];
      meta[lastKey].push(item[1].replace(/^["']|["']$/g, ""));
    }
  }

  return { meta, body };
}

// ─── Chargement d'un skill depuis un dossier ─────────────────────────────────

function loadSkillFromDir(skillDir, priority) {
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!existsSync(skillMdPath)) return null;

  try {
    const raw = readFileSync(skillMdPath, "utf-8");
    const { meta, body } = parseFrontmatter(raw);

    if (meta.enabled === false) return null;

    const indexPath = join(skillDir, "index.js");

    return {
      name:        meta.name || skillDir.split("/").pop() || "unknown",
      version:     meta.version || "1.0.0",
      description: meta.description || "",
      tags:        Array.isArray(meta.tags)        ? meta.tags        : [],
      tools:       Array.isArray(meta.tools)       ? meta.tools       : [],
      keywords:    Array.isArray(meta.keywords)    ? meta.keywords    : [],
      gpuClass:    meta.gpu_class || "light",
      enabled:     meta.enabled !== false,
      permissions: Array.isArray(meta.permissions) ? meta.permissions : [],
      mcps:        Array.isArray(meta.mcps)        ? meta.mcps        : [],
      author:      meta.author || "unknown",
      priority,
      skillPath:   skillDir,
      indexPath:   existsSync(indexPath) ? indexPath : undefined,
      content:     body,
    };
  } catch (err) {
    console.warn(`[SkillLoader] Impossible de charger ${skillMdPath}: ${err.message}`);
    return null;
  }
}

// ─── Scan de tous les dossiers ───────────────────────────────────────────────

function scanSkillDirs() {
  const skills = [];
  const seen = new Set(); // Déduplication : priorité haute gagne

  for (const { path: baseDir, priority } of SKILL_DIRS) {
    if (!existsSync(baseDir)) continue;

    for (const entry of readdirSync(baseDir)) {
      const skillDir = join(baseDir, entry);
      try { if (!statSync(skillDir).isDirectory()) continue; } catch { continue; }

      const skill = loadSkillFromDir(skillDir, priority);
      if (!skill || seen.has(skill.name)) continue;

      seen.add(skill.name);
      skills.push(skill);
    }
  }

  // Ajoute les builtins non couverts par un SKILL.md (priorité 4)
  for (const builtin of BUILTIN_SKILLS) {
    if (seen.has(builtin.name)) continue;
    skills.push({
      ...builtin,
      version:     "1.0.0",
      tools:       [],
      gpuClass:    "light",
      enabled:     true,
      permissions: [],
      mcps:        [],
      author:      "laruche",
      priority:    4,
      skillPath:   "",
      indexPath:   undefined,
      content:     builtin.description,
    });
  }

  return skills.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

// ─── API publique ────────────────────────────────────────────────────────────

/** Retourne tous les skills (cache 30s). */
export function getAllSkills() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;
  _cache = scanSkillDirs();
  _cacheTs = now;
  return _cache;
}

/** Retourne un skill par son nom exact. */
export function getSkill(name) {
  return getAllSkills().find(s => s.name === name);
}

/**
 * Sélectionne les skills les plus pertinents pour un intent donné.
 *
 * Scoring : +3 par keyword, +2 par tag, +1 par mot (>3 chars) dans description.
 * Fallback : complète jusqu'à `max` avec les premiers skills si trop peu de matches.
 *
 * @param {string} intent  Texte de l'intent utilisateur
 * @param {number} max     Nombre max de skills à retourner (défaut: 8)
 */
export function getRelevantSkills(intent, max = 8) {
  const intentLower = intent.toLowerCase();
  const words = intentLower.split(/\s+/).filter(w => w.length > 3);

  const scored = getAllSkills().map(skill => {
    let score = 0;
    for (const kw of skill.keywords) {
      if (intentLower.includes(kw.toLowerCase())) score += 3;
    }
    for (const tag of skill.tags) {
      if (intentLower.includes(tag.toLowerCase())) score += 2;
    }
    for (const word of words) {
      if (skill.description.toLowerCase().includes(word)) score += 1;
    }
    return { skill, score };
  });

  const relevant = scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ skill }) => skill);

  // Fallback : si moins de 4 skills pertinents, compléter avec les premiers
  if (relevant.length < 4) {
    const names = new Set(relevant.map(s => s.name));
    for (const s of getAllSkills()) {
      if (!names.has(s.name)) relevant.push(s);
      if (relevant.length >= max) break;
    }
  }

  return relevant;
}

/** Invalide le cache (force rechargement au prochain appel). */
export function reloadSkills() {
  _cache = null;
  _cacheTs = 0;
}

/**
 * Formate les skills pour injection dans un prompt LLM.
 * Exemple : "- google_search: Effectue une recherche Google | tools: browser.goto, typeInFocusedField"
 */
export function formatSkillsForPrompt(skills) {
  if (skills.length === 0) return "(aucun skill disponible)";
  return skills
    .map(s => `- ${s.name}: ${s.description}${s.tools.length ? ` | tools: ${s.tools.join(", ")}` : ""}`)
    .join("\n");
}
