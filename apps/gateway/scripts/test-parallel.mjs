#!/usr/bin/env node
/**
 * test-parallel.mjs — Lance vitest pour le gateway
 * Stub minimal créé pour Chimera (script original manquant dans le repo)
 */
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

try {
  execSync('npx vitest run', { cwd: root, stdio: 'inherit' });
} catch (e) {
  process.exit(e.status ?? 1);
}
