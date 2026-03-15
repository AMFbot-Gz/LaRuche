#!/usr/bin/env node
/**
 * apps/gateway/scripts/postinstall.js
 * Stub de post-installation pour le gateway moltbot dans le monorepo Chimera.
 * Ce script est requis par le package.json du gateway mais n'a pas d'actions
 * spécifiques dans le contexte monorepo (sans Docker ni build natif).
 */

// Aucune opération requise dans le contexte monorepo Chimera.
// Le gateway utilise directement les sources TypeScript via tsx.
console.log('[gateway/postinstall] OK — monorepo Chimera, aucune action requise.');
