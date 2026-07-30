# syntax = docker/dockerfile:1

# ---- base: Node 24 + pnpm via Corepack ----
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ---- deps: install workspace deps from the frozen lockfile ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile

# ---- build: produces the Nitro node-server output ----
FROM deps AS build
COPY . .
RUN pnpm --filter @pace/web build

# ---- runtime: slim image with only the built server ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.output ./.output
EXPOSE 3000
USER node
CMD ["node", ".output/server/index.mjs"]
