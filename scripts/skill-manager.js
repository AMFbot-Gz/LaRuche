#!/usr/bin/env node
/**
 * skill-manager.js — CLI de gestion des skills LaRuche
 *
 * Usage:
 *   node scripts/skill-manager.js list
 *   node scripts/skill-manager.js info <name>
 *   node scripts/skill-manager.js enable <name>
 *   node scripts/skill-manager.js disable <name>
 *   node scripts/skill-manager.js validate <name>
 *   node scripts/skill-manager.js create "description du skill"
 *
 * Accessible aussi via: laruche skill <cmd>
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SKILL_DIRS = [
  { path: join(ROOT, "workspace/skills"), label: "workspace",  priority: 1 },
  { path: join(ROOT, ".laruche/skills"),  label: "installed",  priority: 2 },
  { path: join(ROOT, "skills"),           label: "project",    priority: 3 },
];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) {
      const [, k, v] = kv;
      if (v === "true") meta[k] = true;
      else if (v === "false") meta[k] = false;
      else meta[k] = v.replace(/^"|"$/g, "");
    }
  }
  return { meta, body: match[2].trim() };
}

function scanSkills() {
  const skills = [];
  const seen = new Set();
  for (const { path: base, label, priority } of SKILL_DIRS) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const dir = join(base, entry);
      if (!statSync(dir).isDirectory()) continue;
      const mdPath = join(dir, "SKILL.md");
      if (!existsSync(mdPath)) continue;
      const { meta } = parseFrontmatter(readFileSync(mdPath, "utf-8"));
      const name = meta.name || entry;
      if (!seen.has(name)) {
        seen.add(name);
        skills.push({ name, meta, dir, label, priority });
      }
    }
  }
  return skills.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

// ─── Commands ─────────────────────────────────────────────────────────────────

const commands = {

  list() {
    const skills = scanSkills();
    if (skills.length === 0) {
      console.log(chalk.yellow("Aucun skill trouvé."));
      return;
    }
    console.log(chalk.bold.hex("#F5A623")("\n🐝 Skills LaRuche\n"));
    const byLabel = {};
    for (const s of skills) {
      if (!byLabel[s.label]) byLabel[s.label] = [];
      byLabel[s.label].push(s);
    }
    for (const [label, group] of Object.entries(byLabel)) {
      console.log(chalk.bold(`  ${label}/`));
      for (const s of group) {
        const status = s.meta.enabled !== false ? chalk.green("✅") : chalk.red("❌");
        const gpu = chalk.dim(`[${s.meta.gpu_class || "light"}]`);
        console.log(`    ${status} ${chalk.cyan(s.name.padEnd(24))} ${gpu} ${s.meta.description || ""}`);
      }
    }
    console.log(chalk.dim(`\n  Total: ${skills.length} skills\n`));
  },

  info(name) {
    if (!name) { console.error(chalk.red("Usage: skill info <name>")); process.exit(1); }
    const skill = scanSkills().find(s => s.name === name);
    if (!skill) { console.error(chalk.red(`Skill "${name}" introuvable.`)); process.exit(1); }
    console.log(chalk.bold.cyan(`\n📦 ${skill.name} v${skill.meta.version || "?"}`) + chalk.dim(` (${skill.label})`));
    console.log(chalk.dim(skill.dir));
    console.log(`\n  ${skill.meta.description || "-"}`);
    if (skill.meta.tags)    console.log(`  Tags:    ${skill.meta.tags}`);
    if (skill.meta.tools)   console.log(`  Tools:   ${skill.meta.tools}`);
    if (skill.meta.mcps)    console.log(`  MCPs:    ${skill.meta.mcps}`);
    if (skill.meta.gpu_class) console.log(`  GPU:     ${skill.meta.gpu_class}`);
    if (skill.meta.author)  console.log(`  Author:  ${skill.meta.author}`);
    console.log();
  },

  enable(name) {
    if (!name) { console.error(chalk.red("Usage: skill enable <name>")); process.exit(1); }
    const skill = scanSkills().find(s => s.name === name);
    if (!skill) { console.error(chalk.red(`Skill "${name}" introuvable.`)); process.exit(1); }
    // Modifier le SKILL.md inline
    const mdPath = join(skill.dir, "SKILL.md");
    const content = readFileSync(mdPath, "utf-8");
    const updated = content.replace(/^enabled:\s*(false|true)$/m, "enabled: true");
    writeFileSync(mdPath, updated);
    console.log(chalk.green(`✅ Skill "${name}" activé.`));
  },

  disable(name) {
    if (!name) { console.error(chalk.red("Usage: skill disable <name>")); process.exit(1); }
    const skill = scanSkills().find(s => s.name === name);
    if (!skill) { console.error(chalk.red(`Skill "${name}" introuvable.`)); process.exit(1); }
    const mdPath = join(skill.dir, "SKILL.md");
    const content = readFileSync(mdPath, "utf-8");
    const updated = content.replace(/^enabled:\s*(false|true)$/m, "enabled: false");
    writeFileSync(mdPath, updated);
    console.log(chalk.yellow(`⏸  Skill "${name}" désactivé.`));
  },

  validate(name) {
    if (!name) { console.error(chalk.red("Usage: skill validate <name>")); process.exit(1); }
    const skill = scanSkills().find(s => s.name === name);
    if (!skill) { console.error(chalk.red(`Skill "${name}" introuvable.`)); process.exit(1); }
    const errors = [];
    if (!skill.meta.name)        errors.push("name manquant dans le frontmatter");
    if (!skill.meta.version)     errors.push("version manquante");
    if (!skill.meta.description) errors.push("description manquante");
    if (!skill.meta.gpu_class)   errors.push("gpu_class manquant (light|medium|heavy|vision)");
    if (errors.length > 0) {
      console.log(chalk.red(`\n❌ "${name}" invalide:`));
      errors.forEach(e => console.log(chalk.red(`  - ${e}`)));
      process.exit(1);
    }
    console.log(chalk.green(`\n✅ Skill "${name}" valide.\n`));
  },

  create(description) {
    if (!description) { console.error(chalk.red("Usage: skill create \"description du skill\"")); process.exit(1); }
    console.log(chalk.dim(`\n🤖 Génération du skill via IA (description: "${description}")...`));
    console.log(chalk.dim("  → Appel à mcp-skill-factory.createSkill()"));
    console.log(chalk.yellow("  ⚠️  Cette commande nécessite LaRuche en cours d'exécution."));
    console.log(chalk.dim("  Alternativement, créez manuellement skills/<nom>/SKILL.md\n"));
    console.log(chalk.bold("Template SKILL.md minimal :"));
    console.log(chalk.dim(`
---
name: mon-skill
version: 1.0.0
description: "${description}"
tags: []
tools: []
gpu_class: light
enabled: true
author: ${process.env.USER || "utilisateur"}
---

## Description
${description}

## Quand utiliser
...

## Étapes
1. ...
    `));
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

if (!cmd || !commands[cmd]) {
  console.log(chalk.bold.hex("#F5A623")("\n🐝 LaRuche Skill Manager\n"));
  console.log("  Usage: node scripts/skill-manager.js <command>\n");
  console.log("  Commands:");
  console.log("    list              Lister tous les skills");
  console.log("    info <name>       Détails d'un skill");
  console.log("    enable <name>     Activer un skill");
  console.log("    disable <name>    Désactiver un skill");
  console.log("    validate <name>   Valider le format SKILL.md");
  console.log("    create <desc>     Générer un skill par IA\n");
  process.exit(0);
}

try {
  await commands[cmd](...args);
} catch (err) {
  console.error(chalk.red(`Erreur: ${err.message}`));
  process.exit(1);
}
