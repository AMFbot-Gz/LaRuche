FROM node:22-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/queen/package.json ./apps/queen/
COPY packages/ ./packages/

# Install dependencies (workspace-aware, queen only)
RUN pnpm install --filter laruche-bot --frozen-lockfile

# Copy source
COPY apps/queen/ ./apps/queen/

WORKDIR /app/apps/queen

EXPOSE 3000 9001

CMD ["node", "src/queen_oss.js"]
