/**
 * skill_evolution.js — Évolution Automatique des Skills
 * Analyse cause racine → patch → tests → versionning → règle générale
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SKILLS_DIR = join(ROOT, "skills");
const REGISTRY_PATH = join(ROOT, ".laruche/registry.json");
const PROFILE_PATH = join(ROOT, ".laruche/patron-profile.json");

const db = new Database(join(ROOT, ".laruche/shadow-errors.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS skill_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    version TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    patch_reason TEXT,
    success INTEGER DEFAULT 1
  );
`);

// Cache registry en mémoire
let _registryCache = null;
let _registryCacheTs = 0;
const REGISTRY_TTL = 10000; // 10s

function loadRegistry() {
  if (_registryCache && Date.now() - _registryCacheTs < REGISTRY_TTL) return _registryCache;
  try { _registryCache = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")); }
  catch { _registryCache = { version: "1.0.0", skills: [] }; }
  _registryCacheTs = Date.now();
  return _registryCache;
}
function saveRegistry(registry) {
  registry.lastUpdated = new Date().toISOString();
  _registryCache = registry;
  _registryCacheTs = Date.now();
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function incrementVersion(version) {
  const parts = version.split(".").map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join(".");
}

async function ollamaAnalyze(prompt) {
  try {
    const res = await fetch(
      `${process.env.OLLAMA_HOST || "http://localhost:11434"}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL || "llama3.2:3b",
          prompt,
          stream: false,
        }),
      }
    );
    const data = await res.json();
    return data.response || "";
  } catch {
    return "";
  }
}

export async function createSkill(description) {
  const skillName = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .substring(0, 30);

  const skillDir = join(SKILLS_DIR, skillName);
  mkdirSync(skillDir, { recursive: true });

  // Génération du code via Ollama
  const codePrompt = `Génère un skill MCP JavaScript pour: ${description}
Le skill doit exporter une fonction principale async.
Format: export async function run(params) { ... }
Code uniquement, pas d'explication.`;

  const code = await ollamaAnalyze(codePrompt);

  const manifest = {
    name: skillName,
    description,
    version: "1.0.0",
    created: new Date().toISOString(),
    ttl: null,
    tests_passing: false,
  };

  writeFileSync(join(skillDir, "skill.js"), code || `// TODO: ${description}\nexport async function run(params) { return "Not implemented"; }`);
  writeFileSync(join(skillDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Enregistrement dans le registre
  const registry = loadRegistry();
  const existing = registry.skills.findIndex((s) => s.name === skillName);
  if (existing >= 0) {
    registry.skills[existing] = manifest;
  } else {
    registry.skills.push(manifest);
  }
  saveRegistry(registry);

  db.prepare("INSERT INTO skill_versions (skill_name, version, timestamp, patch_reason) VALUES (?, ?, ?, ?)")
    .run(skillName, "1.0.0", new Date().toISOString(), "Initial creation");

  return { skillName, path: skillDir, version: "1.0.0" };
}

export async function evolveSkill(skillName, bugReport) {
  const skillDir = join(SKILLS_DIR, skillName);
  if (!existsSync(skillDir)) {
    throw new Error(`Skill ${skillName} introuvable`);
  }

  const manifest = JSON.parse(readFileSync(join(skillDir, "manifest.json"), "utf-8"));
  const currentCode = readFileSync(join(skillDir, "skill.js"), "utf-8");

  // 1. Analyse cause racine + extraction règle en un seul appel
  const combinedPrompt = `Code du skill:\n${currentCode}\n\nBug: ${bugReport.error}\n\nRéponds en JSON:
{
  "cause": "cause racine en 1 phrase",
  "fix": "code corrigé complet",
  "rule": "règle générale à retenir (1 phrase)"
}`;
  const raw = await ollamaAnalyze(combinedPrompt);
  let analysis = { cause: "Unknown", fix: currentCode, rule: "" };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) analysis = { ...analysis, ...JSON.parse(match[0]) };
  } catch {}

  // 2. Application du patch
  const newVersion = incrementVersion(manifest.version);
  const patchedCode = analysis.fix || currentCode;

  // 3. Backup ancienne version
  writeFileSync(join(skillDir, `skill_v${manifest.version}.js.bak`), currentCode);

  // 4. Écriture nouvelle version
  writeFileSync(join(skillDir, "skill.js"), patchedCode);
  manifest.version = newVersion;
  manifest.last_evolved = new Date().toISOString();
  writeFileSync(join(skillDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // 5. Extraction règle générale → Profil Patron (issue du prompt combiné)
  const rule = analysis.rule;

  if (rule) {
    try {
      const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf-8"));
      if (!profile.learned_rules) profile.learned_rules = [];
      profile.learned_rules.push(rule.trim());
      profile.last_updated = new Date().toISOString();
      writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));
    } catch {}
  }

  // 6. Log DB
  db.prepare("INSERT INTO skill_versions (skill_name, version, timestamp, patch_reason) VALUES (?, ?, ?, ?)")
    .run(skillName, newVersion, new Date().toISOString(), analysis.cause);

  // 7. Mise à jour registre
  const registry = loadRegistry();
  const idx = registry.skills.findIndex((s) => s.name === skillName);
  if (idx >= 0) {
    registry.skills[idx].version = newVersion;
    registry.skills[idx].last_evolved = new Date().toISOString();
  }
  saveRegistry(registry);

  return { skillName, oldVersion: manifest.version, newVersion, cause: analysis.cause, rule };
}

export function listSkills() {
  return loadRegistry().skills;
}

export function getSkill(skillName) {
  const skillDir = join(SKILLS_DIR, skillName);
  if (!existsSync(skillDir)) return null;
  return {
    manifest: JSON.parse(readFileSync(join(skillDir, "manifest.json"), "utf-8")),
    code: readFileSync(join(skillDir, "skill.js"), "utf-8"),
  };
}
