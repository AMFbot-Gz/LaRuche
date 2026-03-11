/**
 * planner.js — LaRuche Intent Planner v2
 *
 * Prend une intention naturelle → produit un plan JSON structuré.
 * Un seul appel LLM (pas de boucle) — latence minimale.
 *
 * fix(P1): isComputerUseIntent enrichi — couvre toutes les intentions computer-use
 * fix(P1): BUILTIN_HANDLERS intégrés dans le catalogue de skills connus
 */

import { ask } from "../model_router.js";
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

// ─── BUILTIN skills (toujours disponibles même sans SKILL.md) ────────────────
const BUILTIN_SKILLS = [
  { name: "open_safari",           description: "Ouvre l'application Safari sur macOS",              tags: ["browser","macos","navigation"] },
  { name: "open_browser",          description: "Ouvre un navigateur web (Safari ou Chrome)",         tags: ["browser","navigation"] },
  { name: "go_to_youtube",         description: "Navigue vers YouTube dans le navigateur ouvert",     tags: ["browser","youtube","music"] },
  { name: "search_youtube",        description: "Recherche une vidéo ou playlist sur YouTube",        tags: ["youtube","search","music"] },
  { name: "play_first_result",     description: "Clique sur le premier résultat YouTube pour jouer",  tags: ["youtube","play","music"] },
  { name: "open_app",              description: "Ouvre une application macOS par son nom",            tags: ["macos","apps"] },
  { name: "focus_app",             description: "Met le focus sur une application déjà ouverte",      tags: ["macos","apps"] },
  { name: "goto_url",              description: "Navigue vers une URL dans le navigateur",            tags: ["browser","navigation"] },
  { name: "click_element",         description: "Clique sur un élément de la page web",              tags: ["browser","interaction"] },
  { name: "fill_field",            description: "Remplit un champ de formulaire web",                tags: ["browser","form"] },
  { name: "press_key",             description: "Appuie sur une touche clavier",                     tags: ["keyboard","interaction"] },
  { name: "take_screenshot",       description: "Prend une capture d'écran",                         tags: ["vision","screenshot"] },
  { name: "extract_text",          description: "Extrait le texte visible d'une page web",           tags: ["browser","extraction"] },
  { name: "run_command",           description: "Exécute une commande terminal",                     tags: ["terminal","devops"] },
  { name: "type_text",             description: "Tape du texte dans le champ actif",                 tags: ["keyboard","input"] },
  { name: "press_enter",           description: "Appuie sur la touche Entrée",                      tags: ["keyboard"] },
  { name: "open_vscode",           description: "Ouvre Visual Studio Code",                         tags: ["dev","ide","vscode"] },
  { name: "google_search",         description: "Effectue une recherche Google",                     tags: ["browser","search","google"] },
  { name: "code_generation",       description: "Génère du code selon une description",              tags: ["dev","code","generation"] },
  { name: "run_code",              description: "Exécute du code dans un terminal",                  tags: ["dev","terminal","execution"] },
  { name: "close_app",             description: "Ferme une application macOS",                       tags: ["macos","apps"] },
  { name: "devops_logs",           description: "Consulte les logs d'un service ou d'une app",       tags: ["devops","logs","monitoring"] },
  { name: "manage_projects",       description: "Gère les projets et dossiers de développement",     tags: ["dev","projects","files"] },
];

// ─── Skills catalog ───────────────────────────────────────────────────────────
// Chargé une fois, mis en cache — évite de relire workspace/skills/ à chaque appel
let _skillsCatalog = null;
let _catalogTs = 0;

function loadSkillsCatalog() {
  if (_skillsCatalog && Date.now() - _catalogTs < 30000) return _skillsCatalog;

  const skillsDir = join(ROOT, "workspace/skills");
  const dynamicSkills = [];

  if (existsSync(skillsDir)) {
    for (const name of readdirSync(skillsDir)) {
      const mdPath = join(skillsDir, name, "SKILL.md");
      if (!existsSync(mdPath)) continue;
      try {
        const raw = readFileSync(mdPath, "utf-8");
        const descMatch = raw.match(/description:\s*(.+)/);
        const tagsMatch = raw.match(/tags:\s*\[([^\]]+)\]/);
        // N'ajoute que si pas déjà dans BUILTIN_SKILLS
        if (!BUILTIN_SKILLS.some(b => b.name === name)) {
          dynamicSkills.push({
            name,
            description: descMatch?.[1]?.trim() || name,
            tags: tagsMatch?.[1]?.split(",").map(t => t.trim().replace(/['"/]/g, "")) || [],
          });
        }
      } catch { /* skip */ }
    }
  }

  // Merge: builtin + dynamic (sans doublons)
  _skillsCatalog = [...BUILTIN_SKILLS, ...dynamicSkills];
  _catalogTs = Date.now();
  return _skillsCatalog;
}

// ─── Prompt système planner ───────────────────────────────────────────────────
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

// ─── Détection d'intention computer-use ──────────────────────────────────────
// Patterns enrichis — couvre toutes les actions physiques sur PC
const COMPUTER_USE_PATTERNS = [
  // Navigation / apps
  /ouvre?\s+/i,
  /lance?\s+/i,
  /démarre?\s+/i,
  /ferme?\s+/i,
  /quitte?\s+/i,
  // Musique / média
  /mets?\s+(de\s+la\s+)?musique/i,
  /joue?\s+(de\s+la\s+)?musique/i,
  /play\s+(some\s+)?music/i,
  /mets?\s+(une\s+|la\s+)?playlist/i,
  /lance?\s+(une\s+|la\s+)?playlist/i,
  /mets?\s+(une\s+|la\s+)?vidéo/i,
  /mets?\s+(un\s+|le\s+)?son/i,
  // Navigation web
  /va\s+sur\s+/i,
  /ouvre?\s+(le\s+|un\s+|la\s+)?navigateur/i,
  /cherche?\s+.*(youtube|google|safari|chrome|web)/i,
  /recherche?\s+/i,
  /télécharge?\s+/i,
  // Actions clavier/souris
  /tape?\s+/i,
  /clique?\s+(sur\s+)?/i,
  /appuie?\s+(sur\s+)?/i,
  /glisse?\s+/i,
  // Screenshots / vision
  /screenshot/i,
  /capture\s+d'écran/i,
  /prends?\s+(une\s+)?capture/i,
  // Terminal / dev
  /exécute?\s+/i,
  /lance?\s+(la\s+|le\s+|une\s+|un\s+)?commande/i,
  /installe?\s+/i,
  /ouvre?\s+(vs\s*code|vscode|terminal|finder|chrome|firefox|safari|spotify|slack|discord)/i,
  /crée?\s+(un\s+|le\s+|la\s+|une\s+)?projet/i,
  /copie?\s+/i,
  /déplace?\s+/i,
  /supprime?\s+/i,
  /renomme?\s+/i,
  // Anglais
  /open\s+/i,
  /start\s+/i,
  /close\s+/i,
  /click\s+/i,
  /type\s+/i,
  /search\s+(on\s+)?(youtube|google)/i,
  /play\s+/i,
  /download\s+/i,
  /install\s+/i,
];

export function isComputerUseIntent(text) {
  return COMPUTER_USE_PATTERNS.some(p => p.test(text));
}

// ─── Fonction principale ──────────────────────────────────────────────────────
export async function plan(intent, options = {}) {
  const { timeout = 20000 } = options;
  const skills = loadSkillsCatalog();

  const prompt = buildPlannerPrompt(intent, skills);

  // Utilise le strategist (GLM-4.6) en mode balanced/high, worker en mode low
  const mode = process.env.LARUCHE_MODE || "balanced";
  const role = mode === "low" ? "worker" : "strategist";

  const result = await ask(prompt, {
    role,
    temperature: 0.1, // très bas — on veut du JSON déterministe
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

    // Filtrer les skills inconnus (avec les builtins dans le set)
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
