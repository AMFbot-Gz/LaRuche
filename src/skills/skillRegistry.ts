/**
 * skillRegistry.ts — Registre des skills installés
 *
 * Gère l'état d'installation et d'activation des skills.
 * Persiste dans .laruche/registry.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../");
const REGISTRY_PATH = join(ROOT, ".laruche/skills-registry.json");

// --- Types -------------------------------------------------------------------

export interface SkillRegistryEntry {
  name: string;
  version: string;
  installedAt: string;   // ISO date
  source: "builtin" | "project" | "installed" | "workspace";
  enabled: boolean;
  path: string;
  checksum?: string;
}

type Registry = Record<string, SkillRegistryEntry>;

// --- Registry I/O ------------------------------------------------------------

function loadRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH)) return {};
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveRegistry(registry: Registry): void {
  const dir = join(ROOT, ".laruche");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

// --- API publique ------------------------------------------------------------

export function registerSkill(entry: SkillRegistryEntry): void {
  const registry = loadRegistry();
  registry[entry.name] = entry;
  saveRegistry(registry);
}

export function unregisterSkill(name: string): boolean {
  const registry = loadRegistry();
  if (!registry[name]) return false;
  delete registry[name];
  saveRegistry(registry);
  return true;
}

export function enableSkill(name: string): boolean {
  const registry = loadRegistry();
  if (!registry[name]) return false;
  registry[name].enabled = true;
  saveRegistry(registry);
  return true;
}

export function disableSkill(name: string): boolean {
  const registry = loadRegistry();
  if (!registry[name]) return false;
  registry[name].enabled = false;
  saveRegistry(registry);
  return true;
}

export function getRegisteredSkills(): SkillRegistryEntry[] {
  return Object.values(loadRegistry());
}

export function isSkillEnabled(name: string): boolean {
  const registry = loadRegistry();
  // Si absent du registre, on le considère activé par défaut (SKILL.md enabled: true)
  return registry[name]?.enabled ?? true;
}
