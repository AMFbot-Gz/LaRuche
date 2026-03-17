#!/usr/bin/env node
/**
 * bin/laruche-skill-runner.js — CLI to run a single Chimera skill
 * Usage: laruche-skill <skill-name> [args...]
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillName = process.argv[2];

if (!skillName) {
  console.error('Usage: laruche-skill <skill-name> [args...]');
  process.exit(1);
}

console.log(`🐝 Running skill: ${skillName}`);

// Delegate to queen skill runner
const { runSkill } = await import('../src/skills/runner.js').catch(() => {
  console.error('Skill runner not available — ensure Queen is set up correctly');
  process.exit(1);
});

await runSkill(skillName, process.argv.slice(3));
