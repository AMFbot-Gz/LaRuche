/**
 * @chimera/config — Mode LaRuche : LOCAL ou CLOUD
 *
 * LOCAL (défaut) : Ollama local, données sur la machine, gratuit, Computer Use activé
 * CLOUD          : Claude API, Railway/Neon, Clerk auth, Stripe billing
 *
 * Usage :
 *   LARUCHE_MODE=cloud node src/queen_oss.js
 *   LARUCHE_MODE=local  node src/queen_oss.js   ← défaut
 */

export type LaRucheMode = 'local' | 'cloud';

const MODE: LaRucheMode =
  (process.env.LARUCHE_MODE as LaRucheMode) === 'cloud' ? 'cloud' : 'local';

export const config = {
  mode: MODE,
  isLocal: MODE === 'local',
  isCloud: MODE === 'cloud',

  llm: {
    provider: MODE === 'local' ? 'ollama' : 'anthropic',
    model: MODE === 'local'
      ? (process.env.OLLAMA_MODEL_DEFAULT || 'llama3.2:3b')
      : (process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'),
    endpoint: MODE === 'local'
      ? (process.env.OLLAMA_HOST || 'http://localhost:11434')
      : 'https://api.anthropic.com',
    apiKey: MODE === 'local' ? null : process.env.ANTHROPIC_API_KEY ?? null,
  },

  storage: {
    // LOCAL : SQLite sur la machine (pas besoin de Postgres)
    // CLOUD : Neon PostgreSQL hébergé via DATABASE_URL
    type: MODE === 'local' ? 'sqlite' : 'postgres',
    url: MODE === 'local'
      ? './data/laruche.db'
      : (process.env.DATABASE_URL ?? ''),
  },

  auth: {
    // LOCAL : pas d'auth — utilisateur unique souverain
    // CLOUD : Clerk pour les comptes multi-utilisateurs
    enabled: MODE === 'cloud',
    clerkPublishableKey: MODE === 'cloud' ? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null : null,
  },

  billing: {
    // LOCAL : gratuit pour toujours
    // CLOUD : Stripe FREE/PRO($19)/TEAMS($79)
    enabled: MODE === 'cloud',
    stripeSecretKey: MODE === 'cloud' ? process.env.STRIPE_SECRET_KEY ?? null : null,
    plans: {
      pro: { price: 19, priceId: process.env.STRIPE_PRO_PRICE_ID ?? '' },
      teams: { price: 79, priceId: process.env.STRIPE_TEAMS_PRICE_ID ?? '' },
    },
  },

  computerUse: {
    // LOCAL : Computer Use via PyAutoGUI sur ta machine
    // CLOUD : désactivé (sécurité — on ne contrôle pas la machine d'un client)
    enabled: MODE === 'local',
  },

  telegram: {
    // Les deux modes supportent Telegram
    token: process.env.TELEGRAM_BOT_TOKEN ?? null,
    adminId: process.env.ADMIN_TELEGRAM_ID ?? null,
  },
} as const;

export default config;
