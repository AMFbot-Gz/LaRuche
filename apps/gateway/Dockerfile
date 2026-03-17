FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/gateway/package.json ./apps/gateway/
RUN pnpm install --filter moltbot --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/gateway/node_modules ./apps/gateway/node_modules
COPY apps/gateway/ ./apps/gateway/
RUN cd apps/gateway && pnpm build

# ── runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app/apps/gateway
ENV NODE_ENV=production

COPY --from=builder /app/apps/gateway/dist ./dist
COPY --from=builder /app/apps/gateway/moltbot.mjs* ./
COPY --from=builder /app/apps/gateway/skills ./skills
COPY --from=deps /app/apps/gateway/node_modules ./node_modules
COPY apps/gateway/package.json .

EXPOSE 8100

CMD ["node", "scripts/run-node.mjs"]
