/**
 * planner.js — LaRuche Intent Planner
 *
 * Prend une intention naturelle → produit un plan JSON structuré.
 * Un seul appel LLM (pas de boucle) — latence minimale.
 *
 * Output format:
 * {
 *   "goal": "description courte de l'objectif",
 *   "steps": [
 *     { "skill": "open_safari", "params": {} },
 *     { "skill": "go_to_youtube", "params": {} },
 *     { "skill": "search_youtube", "params": { "query": "chill lofi playlist" } },
 *     { "skill": "play_first_result", "params": {} }
 *   ]
 * }
 */

import { ask } from "../model_router.js";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── Skills catalog ────────────────────────────────────────────────────────────
// Chargé une fois, mis en cache — évite de relire workspace/skills/ à chaque appel

let _skillsCatalog = null;
let _catalogTs = 0;

function loadSkillsCatalog() {
  if (_skillsCatalog && Date.now() - _catalogTs < 30000) return _skillsCatalog;

  const skillsDir = join(ROOT, "workspace/skills");
  if (!existsSync(skillsDir)) { _skillsCatalog = []; return []; }

  const skills = [];
  for (const name of readdirSync(skillsDir)) {
    const mdPath = join(skillsDir, name, "SKILL.md");
    if (!existsSync(mdPath)) continue;
    try {
      const raw = readFileSync(mdPath, "utf-8");
      const descMatch = raw.match(/description:\s*(.+)/);
      const tagsMatch = raw.match(/tags:\s*\[([^\]]+)\]/);
      skills.push({
        name,
        description: descMatch?.[1]?.trim() || name,
        tags: tagsMatch?.[1]?.split(",").map(t => t.trim().replace(/['"]/g, "")) || [],
      });
    } catch { /* skip */ }
  }

  _skillsCatalog = skills;
  _catalogTs = Date.now();
  return skills;
}

// ─── Prompt système planner ────────────────────────────────────────────────────

function buildPlannerPrompt(intent, skills) {
  const skillList = skills.map(s => `- ${s.name}: ${s.description}`).join("\n");

  return `Tu es le Planner de LaRuche, un agent IA qui contrôle un PC macOS.

SKILLS DISPONIBLES:
${skillList}

RÈGLES ABSOLUES:
1. Réponds UNIQUEMENT avec un objet JSON valide — aucun texte avant ou après.
2. Décompose toujours en étapes atomiques dans "steps".
3. Utilise UNIQUEMENT les skills listés ci-dessus (exactement ces noms).
4. Si un paramètre est ambigu (ex: quelle musique?), choisis une valeur par défaut raisonnable.
5. Ne demande JAMAIS de précision à l'utilisateur — planifie avec les infos disponibles.
6. Minimum de steps nécessaires — pas de redondance.

FORMAT DE SORTIE (JSON strict):
{
  "goal": "description courte de l'objectif en français",
  "confidence": 0.0-1.0,
  "steps": [
    { "skill": "nom_du_skill", "params": { "cle": "valeur" } }
  ]
}

INTENTION UTILISATEUR: "${intent}"

Réponds maintenant avec le JSON plan:`;
}

// ─── Détection d'intention ────────────────────────────────────────────────────
// Patterns qui indiquent une action physique (computer-use) vs une question

const COMPUTER_USE_PATTERNS = [
  /ouvre?\s+/i,
  /lance?\s+/i,
  /mets?\s+(de\s+la\s+)?musique/i,
  /joue?\s+(de\s+la\s+)?musique/i,
  /va\s+sur\s+/i,
  /cherche?\s+.*(youtube|google|safari|chrome)/i,
  /tape?\s+/i,
  /clique?\s+(sur\s+)?/i,
  /ferme?\s+/i,
  /play\s+/i,
  /start\s+/i,
  /screenshot/i,
];

export function isComputerUseIntent(text) {
  return COMPUTER_USE_PATTERNS.some(p => p.test(text));
}

// ─── Fonction principale ───────────────────────────────────────────────────────

export async function plan(intent, options = {}) {
  const { timeout = 20000 } = options;

  const skills = loadSkillsCatalog();
  if (skills.length === 0) {
    return {
      goal: intent,
      confidence: 0.3,
      steps: [],
      error: "Aucun skill disponible dans workspace/skills/",
    };
  }

  const prompt = buildPlannerPrompt(intent, skills);

  // Utilise le strategist (GLM-4.6) en mode balanced/high, worker en mode low
  const mode = process.env.LARUCHE_MODE || "balanced";
  const role = mode === "low" ? "worker" : "strategist";

  const result = await ask(prompt, {
    role,
    temperature: 0.1,   // très bas — on veut du JSON déterministe
    timeout,
  });

  if (!result.success || !result.text) {
    return { goal: intent, confidence: 0, steps: [], error: result.error };
  }

  // Parse JSON — robuste aux balises markdown
  try {
    const cleaned = result.text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Pas de JSON trouvé");

    const parsed = JSON.parse(jsonMatch[0]);

    // Validation minimale
    if (!Array.isArray(parsed.steps)) parsed.steps = [];
    if (!parsed.goal) parsed.goal = intent;
    if (typeof parsed.confidence !== "number") parsed.confidence = 0.8;

    // Filtrer les skills inconnus
    const knownNames = new Set(skills.map(s => s.name));
    parsed.steps = parsed.steps.filter(s => {
      if (!knownNames.has(s.skill)) {
        console.warn(`[planner] Skill inconnu ignoré: ${s.skill}`);
        return false;
      }
      return true;
    });

    return { ...parsed, model: result.model };

  } catch (e) {
    return {
      goal: intent,
      confidence: 0,
      steps: [],
      error: `Parse error: ${e.message}`,
      raw: result.text.slice(0, 200),
    };
  }
}
