# One image, one process, one origin: Fastify serves both the API and the
# built client, so there is no CORS config and no second dashboard to watch.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/relic-core/package.json ./packages/relic-core/
RUN pnpm install --frozen-lockfile

# --------------------------------------------------------------- build
FROM deps AS build
COPY . .
RUN pnpm --filter @relic/web build

# ---------------------------------------------------------------- run
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/relic-core/node_modules ./packages/relic-core/node_modules
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY package.json pnpm-workspace.yaml ./
COPY apps/api ./apps/api
COPY packages/relic-core ./packages/relic-core

# Generated relics live on disk. Without a mounted volume the cache resets on
# every deploy, which means the first fight after a deploy pays full price.
VOLUME ["/app/apps/api/storage", "/app/apps/api/cache"]

EXPOSE 8787
ENV PORT=8787
CMD ["pnpm", "--filter", "@relic/api", "start"]
