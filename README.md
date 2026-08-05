# Pace

A personal productivity app — *set your own pace*. Built as a self-managed
learning project across web, desktop, and mobile, sharing one backend.

## Workspaces

A pnpm + Turborepo monorepo:

| Workspace | Path | What it is |
|---|---|---|
| `@pace/api` | `apps/api` | Standalone Nitro API server + Better Auth, Postgres via Drizzle |
| `@pace/web` | `apps/web` | TanStack Start web app (also hosts the Tauri desktop shell in `src-tauri/`) |
| `@pace/mobile` | `apps/mobile` | Expo / React Native app |
| `@pace/tsconfig` | `packages/tsconfig` | Shared TypeScript base config |
| `@pace/e2e` | `e2e` | Playwright end-to-end tests (web → API → Postgres) |

All clients talk to `@pace/api` over HTTP: web + desktop authenticate with
cookies, mobile with a secure-store token.

## Prerequisites

- **Node** ≥ 24.16.0 and **pnpm** 11.9.0 (`packageManager` is pinned)
- **Docker** — local Postgres runs via `docker-compose.yml`

```bash
pnpm install
cp .env.example .env          # then adjust values
docker compose up -d          # start local Postgres
pnpm --filter @pace/api db:migrate   # apply the schema
```

## Running things

There is **no root-level script** — each workspace owns its scripts. Run them
by `cd`-ing into the folder, or from anywhere with `--filter`:

```bash
cd apps/api && pnpm dev              # from the folder
pnpm --filter @pace/api dev          # from anywhere (root included)
```

Bring several up together with Turborepo:

```bash
pnpm turbo dev --filter=@pace/api --filter=@pace/web   # API + web
pnpm turbo typecheck                                    # typecheck all apps
pnpm turbo build                                        # build everything, in dependency order
```

Default dev ports: **web** `:3000`, **API** `:3001`, **Postgres** `:5432`.

### `@pace/api` — `apps/api` (needs Postgres running)

| Script | Command | Notes |
|---|---|---|
| `dev` | `nitro dev --port 3001` | the API server |
| `build` | `nitro build` | prod bundle → `.output/` |
| `start` | `node .output/server/index.mjs` | run the built server |
| `typecheck` | `tsc --noEmit` | |
| `db:generate` | `drizzle-kit generate` | create a migration from schema changes |
| `db:migrate` | `drizzle-kit migrate` | apply migrations to Postgres |
| `db:push` | `drizzle-kit push` | push schema without a migration file (dev-only) |
| `auth:generate` | Better Auth CLI | regenerate `src/db/schema.ts` after changing auth options |
| `prepare` | `nitro prepare` | runs automatically on `pnpm install` — don't call it directly |

### `@pace/web` — `apps/web`

| Script | Command | Notes |
|---|---|---|
| `dev` | `vite dev --port 3000` | the web app |
| `build` | `vite build` | |
| `preview` | `vite preview` | serve the built app |
| `typecheck` | `tsc --noEmit` | |
| `generate-routes` | `tsr generate` | regenerate `routeTree.gen.ts` after adding routes |

Desktop (Tauri) isn't a pnpm script — run it via the `cargo tauri` / Tauri CLI
in the Nix dev shell. In dev it loads the web app at `localhost:3000`.

### `@pace/mobile` — `apps/mobile`

| Script | Command |
|---|---|
| `start` | `expo start` (Metro dev server) |
| `android` / `ios` / `web` | `expo start --<platform>` |
| `typecheck` | `tsc --noEmit` |

EAS builds (`eas build …`) use the EAS CLI, not a pnpm script. On-device runs
need `EXPO_PUBLIC_API_URL` set to your machine's LAN IP (see
`apps/mobile/.env.example`).

### `@pace/e2e` — `e2e`

Playwright end-to-end tests (the auth flow, web → API → Postgres, in a real browser).

| Script | Command |
|---|---|
| `test` | `playwright test` |
| `test:ui` | `playwright test --ui` |
| `typecheck` | `tsc --noEmit` |

Tests run against a dedicated **`pace_test`** database (created, migrated, and truncated automatically) and the **production web build** — both started by Playwright on dedicated ports (web `:3100`, API `:3101`), so the suite coexists with your dev servers. Postgres must be up (`docker compose up -d`).

**NixOS browsers:** Playwright's prebuilt browsers don't run on NixOS, so the flake's dev shell wires up the nix-provided ones (`PLAYWRIGHT_BROWSERS_PATH`). Enter it first:

```bash
nix develop
pnpm --filter @pace/e2e test       # or test:ui
```

`@playwright/test` is pinned to the flake's `playwright-driver` version (both **1.59.1**) so the browser build matches — keep them in lockstep when bumping either. CI (Ubuntu) uses the standard `playwright install` instead.

## Formatting & linting

Biome is run as a **binary**, not a pnpm script (a NixOS provisioning quirk):

```bash
biome check .            # check
biome check --write .    # check + autofix
```

## Reset the local database

```bash
# clear data, keep the schema (routine)
docker compose exec postgres psql -U pace -d pace \
  -c 'TRUNCATE "user", session, account, verification CASCADE;'

# clean slate — drops tables too, so re-migrate afterward
docker compose down -v && docker compose up -d
pnpm --filter @pace/api db:migrate
```
