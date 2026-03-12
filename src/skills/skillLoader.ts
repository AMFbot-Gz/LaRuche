/**
 * skillLoader.ts — Chargeur de skills LaRuche
 *
 * Charge les SKILL.md depuis 4 niveaux de priorité :
 *   1. workspace/skills/   (utilisateur)
 *   2. .laruche/skills/    (installés via CLI)
 *   3. skills/             (projet)
 *   4. BUILTIN_SKILLS      (fallback hardcodé)
 *
 * Expose :
 *   - getAllSkills()                    → SkillMeta[]
 *   - getSkill(name)                    → SkillMeta | undefined
 *   - getRelevantSkills(intent, max)    → SkillMeta[] (sélection par pertinence)
 *   - reloadSkills()                    → void (invalide le cache)
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../");

// --- Types -------------------------------------------------------------------

export interface SkillMeta {
  name: string;
  version: string;
  description: string;
  tags: string[];
  tools: string[];
  keywords: string[];
  gpuClass: "light" | "medium" | "heavy" | "vision";
  enabled: boolean;
  permissions: string[];
  mcps: string[];
  author: string;
  priority: number;  // 1 (max) → 4 (min)
  skillPath: string; // Chemin du dossier
  indexPath?: string; // Chemin de index.js si présent
  content: string;   // Corps du SKILL.md (injecté dans le prompt)
}

// --- Cache -------------------------------------------------------------------

const CACHE_TTL_MS = 30_000;
let _cache: SkillMeta[] | null = null;
let _cacheTs = 0;

// --- Niveaux de priorité -----------------------------------------------------

const SKILL_DIRS: Array<{ path: string; priority: number }> = [
  { path: join(ROOT, "workspace/skills"), priority: 1 },
  { path: join(ROOT, ".laruche/skills"),  priority: 2 },
  { path: join(ROOT, "skills"),           priority: 3 },
];

// --- Parser SKILL.md ---------------------------------------------------------

/**
 * Parse le frontmatter YAML d'un SKILL.md.
 * Implémentation légère sans dépendance yaml (pour éviter un import lourd).
 */
function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const yamlStr = match[1];
  const body = match[2].trim();
  const meta: Record<string, any> = {};

  for (const line of yamlStr.split("\n")) {
    // Paires clé: valeur simples
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      // Conversion des types basiques
      if (value === "true") meta[key] = true;
      else if (value === "false") meta[key] = false;
      else if (/^\d+\.\d+\.\d+$/.test(value)) meta[key] = value; // SemVer
      else if (/^\d+$/.test(value)) meta[key] = parseInt(value);
      else meta[key] = value.replace(/^"|"$/g, ""); // Strip quotes
      continue;
    }
    // Items de liste (débutant par - )
    const listItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (listItemMatch) {
      const prevLine = yamlStr.split("\n").indexOf(line);
      // Cherche la clé précédente
      for (let i = prevLine - 1; i >= 0; i--) {
        const prevKey = yamlStr.split("\n")[i].match(/^(\w[\w-]*):\s*$/);
        if (prevKey) {
          const key = prevKey[1];
          if (!Array.isArray(meta[key])) meta[key] = [];
          meta[key].push(listItemMatch[1].replace(/^"|"$/g, ""));
          break;
        }
      }
    }
  }

  return { meta, body };
}

/**
 * Charge un skill depuis un dossier.
 * Retourne null si SKILL.md absent ou skill désactivé.
 */
function loadSkillFromDir(skillDir: string, priority: number): SkillMeta | null {
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
      tags:        Array.isArray(meta.tags) ? meta.tags : [],
      tools:       Array.isArray(meta.tools) ? meta.tools : [],
      keywords:    Array.isArray(meta.keywords) ? meta.keywords : [],
      gpuClass:    (meta.gpu_class || "light") as SkillMeta["gpuClass"],
      enabled:     meta.enabled !== false,
      permissions: Array.isArray(meta.permissions) ? meta.permissions : [],
      mcps:        Array.isArray(meta.mcps) ? meta.mcps : [],
      author:      meta.author || "unknown",
      priority,
      skillPath:   skillDir,
      indexPath:   existsSync(indexPath) ? indexPath : undefined,
      content:     body,
    };
  } catch (err: any) {
    console.warn(`[SkillLoader] Impossible de charger ${skillMdPath}: ${err.message}`);
    return null;
  }
}

// --- Scan des dossiers -------------------------------------------------------

function scanSkillDirs(): SkillMeta[] {
  const skills: SkillMeta[] = [];
  const seen = new Set<string>(); // Déduplication par nom (priorité haute gagne)

  for (const { path: baseDir, priority } of SKILL_DIRS) {
    if (!existsSync(baseDir)) continue;

    const entries = readdirSync(baseDir);
    for (const entry of entries) {
      const skillDir = join(baseDir, entry);
      try {
        if (!statSync(skillDir).isDirectory()) continue;
      } catch {
        continue;
      }

      const skill = loadSkillFromDir(skillDir, priority);
      if (!skill) continue;

      // Priorité haute gagne en cas de conflit
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        skills.push(skill);
      }
    }
  }

  // Tri : priorité croissante (1 avant 4), puis alphabétique
  return skills.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

// --- API publique ------------------------------------------------------------

/**
 * Retourne tous les skills chargés (avec cache 30s).
 */
export function getAllSkills(): SkillMeta[] {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;

  _cache = scanSkillDirs();
  _cacheTs = now;
  return _cache;
}

/**
 * Retourne un skill par son nom.
 */
export function getSkill(name: string): SkillMeta | undefined {
  return getAllSkills().find(s => s.name === name);
}

/**
 * Sélectionne les skills les plus pertinents pour un intent donné.
 *
 * Algorithme de scoring :
 *   +3 points par mot-clé correspondant
 *   +2 points par tag correspondant
 *   +1 point par mot dans la description correspondant
 *
 * @param intent  Texte de l'intent utilisateur
 * @param max     Nombre maximum de skills à retourner (défaut: 8)
 */
export function getRelevantSkills(intent: string, max = 8): SkillMeta[] {
  const intentLower = intent.toLowerCase();
  const words = intentLower.split(/\s+/);

  const scored = getAllSkills().map(skill => {
    let score = 0;

    // Correspondance mots-clés (poids fort)
    for (const kw of skill.keywords) {
      if (intentLower.includes(kw.toLowerCase())) score += 3;
    }

    // Correspondance tags
    for (const tag of skill.tags) {
      if (intentLower.includes(tag.toLowerCase())) score += 2;
    }

    // Correspondance mots dans la description
    for (const word of words) {
      if (word.length > 3 && skill.description.toLowerCase().includes(word)) score += 1;
    }

    return { skill, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ skill }) => skill);
}

/**
 * Invalide le cache (forcer un rechargement au prochain appel).
 */
export function reloadSkills(): void {
  _cache = null;
  _cacheTs = 0;
}

/**
 * Formate les skills pour injection dans un prompt LLM.
 * Retourne un string compact listant name + description + tools.
 */
export function formatSkillsForPrompt(skills: SkillMeta[]): string {
  if (skills.length === 0) return "";
  return skills
    .map(s => `- **${s.name}** (${s.gpuClass}): ${s.description}${s.tools.length ? ` | tools: ${s.tools.join(", ")}` : ""}`)
    .join("\n");
}
