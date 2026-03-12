/**
 * planner.js — LaRuche Intent Planner v3
 * Dynamic via skillLoader.js — fini les BUILTIN_SKILLS hardcodés
 */

import { ask } from "../model_router.js";
import { getAllSkills, getRelevantSkills, formatSkillsForPrompt } from "../skills/skillLoader.js";

// ─── Prompt système planner ────────────────────────────────────────────────────────────
function buildPlannerPrompt(intent, skills) {
  const skillList = formatSkillsForPrompt(skills);
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

// ─── Détection d'intention computer-use ──────────────────────────────────────────────
const COMPUTER_USE_PATTERNS = [
  /ouvre?\s+/i, /lance?\s+/i, /démarre?\s+/i, /ferme?\s+/i, /quitte?\s+/i,
  /mets?\s+(de\s+la\s+)?musique/i, /joue?\s+(de\s+la\s+)?musique/i, /play\s+(some\s+)?music/i,
  /mets?\s+(une\s+|la\s+)?playlist/i, /lance?\s+(une\s+|la\s+)?playlist/i,
  /mets?\s+(une\s+|la\s+)?vidéo/i, /mets?\s+(un\s+|le\s+)?son/i,
  /va\s+sur\s+/i, /ouvre?\s+(le\s+|un\s+|la\s+)?navigateur/i,
  /cherche?\s+.*(youtube|google|safari|chrome|web)/i, /recherche?\s+/i, /télécharge?\s+/i,
  /tape?\s+/i, /clique?\s+(sur\s+)?/i, /appuie?\s+(sur\s+)?/i, /glisse?\s+/i,
  /screenshot/i, /capture\s+d'écran/i, /prends?\s+(une\s+)?capture/i,
  /exécute?\s+/i, /lance?\s+(la\s+|le\s+|une\s+|un\s+)?commande/i, /installe?\s+/i,
  /ouvre?\s+(vs\s*code|vscode|terminal|finder|chrome|firefox|safari|spotify|slack|discord)/i,
  /crée?\s+(un\s+|le\s+|la\s+|une\s+)?projet/i, /copie?\s+/i, /déplace?\s+/i,
  /supprime?\s+/i, /renomme?\s+/i,
  /open\s+/i, /start\s+/i, /close\s+/i, /click\s+/i, /type\s+/i,
  /search\s+(on\s+)?(youtube|google)/i, /play\s+/i, /download\s+/i, /install\s+/i,
];

export function isComputerUseIntent(text) {
  return COMPUTER_USE_PATTERNS.some(p => p.test(text));
}

// ─── Fonction principale ───────────────────────────────────────────────────────────
export async function plan(intent, options = {}) {
  const { timeout = 20000 } = options;

  // 15 skills les plus pertinents pour cette intention
  const skills = getRelevantSkills(intent, 15);
  const prompt = buildPlannerPrompt(intent, skills);

  const mode = process.env.LARUCHE_MODE || "balanced";
  const role = mode === "low" ? "worker" : "strategist";

  const result = await ask(prompt, { role, temperature: 0.1, timeout });

  if (!result.success || !result.text) {
    return { goal: intent, confidence: 0, steps: [], error: result.error };
  }

  try {
    const cleaned = result.text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Pas de JSON trouvé");
    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.steps)) parsed.steps = [];
    if (!parsed.goal) parsed.goal = intent;
    if (typeof parsed.confidence !== "number") parsed.confidence = 0.8;

    // Valider contre le catalogue complet (pas seulement les 15 pertinents)
    const knownNames = new Set(getAllSkills().map(s => s.name));
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
      goal: intent, confidence: 0, steps: [],
      error: `Parse error: ${e.message}`,
      raw: result.text.slice(0, 200),
    };
  }
}
