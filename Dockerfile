# AGONE — image de production (Coolify, VPS Infomaniak).
# Construite avec Bun (gestionnaire de paquets du projet), exécutée par Node 26 (LTS active).
# Aucune variable secrète au build : toutes sont lues au démarrage (src/env.ts).
FROM node:26-slim AS base
COPY --from=oven/bun:1.4.5-slim /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

# Dépendances complètes + build SvelteKit (adapter-node → build/).
FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Dépendances de production seules : adapter-node laisse les « dependencies » hors du bundle.
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:26-slim
# curl : la vérification de santé de Coolify s'exécute dans le conteneur, avec curl ou wget.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production PORT=3000 BODY_SIZE_LIMIT=100M
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:3000/api/sante || exit 1
CMD ["node", "build/index.js"]
