#!/usr/bin/env node
/**
 * generate-skills.js — Génère des skills LaRuche depuis les CLIs cli-anything installés
 *
 * Usage :
 *   node skills/cli-anything/generate-skills.js
 *
 * Ce script :
 * 1. Détecte les packages cli-anything installés via pip
 * 2. Crée un skill skills/core/cli-{nom}/skill.js pour chacun
 * 3. Met à jour skills/core/registry.json
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_CORE = join(__dirname, "..", "core");
const REGISTRY_PATH = join(SKILLS_CORE, "registry.json");

// 1. Détecter les cli-anything installés
let installed = [];
try {
  const out = execSync("pip3 list 2>/dev/null | grep cli-anything-", {
    encoding: "utf-8",
    timeout: 10000,
  });
  installed = out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0].toLowerCase()); // ex: "cli-anything-libreoffice"
} catch {
  console.log("Aucun package cli-anything trouvé via pip3.");
}

if (installed.length === 0) {
  console.log(
    [
      "Aucun CLI-Anything installé.",
      "",
      "Pour installer :",
      "  1. Installe les apps cibles (/Applications/LibreOffice.app, etc.)",
      "  2. Dans Claude Code : /cli-anything /Applications/LibreOffice.app",
      "  3. Relance ce script",
    ].join("\n")
  );
  process.exit(0);
}

console.log(`CLIs détectés : ${installed.join(", ")}`);

// 2. Pour chaque CLI, créer le skill
const created = [];
for (const pkg of installed) {
  const name = pkg.replace("cli-anything-", ""); // ex: "libreoffice"
  const skillDir = join(SKILLS_CORE, `cli-${name}`);

  if (existsSync(skillDir)) {
    console.log(`Skill cli-${name} déjà existant — skipped`);
    continue;
  }

  mkdirSync(skillDir, { recursive: true });

  // skill.js générique qui délègue au CLI pip
  writeFileSync(
    join(skillDir, "skill.js"),
    `/**
 * Skill auto-généré par CLI-Anything pour ${name}
 * Package pip : ${pkg}
 *
 * Exemples Telegram :
 *   "utilise ${name} pour créer un fichier PDF"
 *   "${name} status"
 */

import { spawnSync } from "child_process";

export async function run({ command = "help", args = [], json = true, timeout = 30000 } = {}) {
  const fullArgs = json ? ["--json", command, ...args] : [command, ...args];

  const result = spawnSync("${pkg}", fullArgs, {
    encoding: "utf-8",
    timeout,
  });

  if (result.error) {
    return { success: false, error: result.error.message };
  }

  const raw = result.stdout || "";
  let parsed = raw;
  if (json) {
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  }

  return {
    success: result.status === 0,
    command,
    result: parsed,
    error: result.stderr?.slice(0, 500) || undefined,
  };
}
`
  );

  // manifest.json
  writeFileSync(
    join(skillDir, "manifest.json"),
    JSON.stringify(
      {
        name: `cli-${name}`,
        description: `Contrôle ${name} via CLI-Anything — agent-native`,
        version: "1.0.0",
        category: "cli-anything",
        author: "cli-anything-generator",
        tier: "cli-anything",
        tags: [name, "cli-anything", "app-control"],
        triggers: [
          name,
          `ouvre ${name}`,
          `utilise ${name}`,
          `lance ${name}`,
          `${name} help`,
        ],
        cliPackage: pkg,
        generated: new Date().toISOString(),
      },
      null,
      2
    )
  );

  created.push(`cli-${name}`);
  console.log(`✅ Skill créé : cli-${name}`);
}

// 3. Mettre à jour registry.json
if (created.length > 0 && existsSync(REGISTRY_PATH)) {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  for (const skillName of created) {
    const manifestPath = join(SKILLS_CORE, skillName, "manifest.json");
    if (existsSync(manifestPath) && !registry.skills.find((s) => s.name === skillName)) {
      registry.skills.push(JSON.parse(readFileSync(manifestPath, "utf-8")));
      console.log(`📋 Registry mis à jour : ${skillName}`);
    }
  }
  registry.lastUpdated = new Date().toISOString();
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log(`\nRegistry total : ${registry.skills.length} skills`);
}

if (created.length === 0) {
  console.log("Aucun nouveau skill créé.");
} else {
  console.log(`\n${created.length} skill(s) créé(s) : ${created.join(", ")}`);
  console.log("Relancer la Queen pour les activer : make restart");
}
