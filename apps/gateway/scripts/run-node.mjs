#!/usr/bin/env node
/**
 * run-node.mjs — Gateway dev/start launcher
 * Starts apps/gateway via tsx (TypeScript runtime, no pre-build needed)
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');

const args   = process.argv.slice(2);
const isDev  = args.includes('--dev');

console.log(`🌐 Gateway starting (${isDev ? 'dev' : 'prod'} mode)...`);

const child = spawn(
  'node',
  ['--import', 'tsx', 'src/index.ts', ...args],
  {
    cwd:   ROOT,
    stdio: 'inherit',
    env:   { ...process.env },
  }
);

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.warn('⚠️  Gateway: tsx not found — run `pnpm install` first');
  } else {
    console.error('Gateway error:', err.message);
  }
  process.exit(1);
});

child.on('exit', (code) => process.exit(code ?? 0));
