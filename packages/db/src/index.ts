// src/index.ts — Singleton PrismaClient pour @chimera/db
// Pattern singleton recommandé par Prisma pour éviter les connexions multiples
// en développement (hot-reload Next.js / Node.js)

import { PrismaClient } from "@prisma/client";

// Déclaration globale pour le singleton en développement
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// En production : nouvelle instance à chaque démarrage du process
// En développement : réutilise l'instance globale pour éviter les "too many connections"
const createPrismaClient = (): PrismaClient => {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
};

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

// Re-exports des types Prisma générés
export * from "@prisma/client";
export type { PrismaClient };
