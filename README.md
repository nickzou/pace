# Pace

A personal productivity app — *set your own pace*. Built as a self-managed
learning project across web, desktop, and mobile — **offline-first**, sharing one
backend: every client reads and writes a local SQLite database that a self-hosted
PowerSync service keeps in sync with Postgres.

## Workspaces

A pnpm + Turborepo monorepo:

| Workspace | Path | What it is |
|---|---|---|
| `@pace/api` | `apps/api` | Standalone Nitro API server + Better Auth, Postgres via Drizzle |
| `@pace/web` | `apps/web` | TanStack Start web app (also hosts the Tauri desktop shell in `src-tauri/`) |
| `@pace/mobile` | `apps/mobile` | Expo / React Native app |
| `@pace/api-client` | `packages/api-client` | Shared tRPC client factory + provider |
| `@pace/validation` | `packages/validation` | Shared Zod schemas — the domain model |
| `@pace/tsconfig` | `packages/tsconfig` | Shared TypeScript base config |
| `@pace/e2e` | `e2e` | Playwright end-to-end tests (web) |
| `@pace/desktop-e2e` | `desktop-e2e` | WebdriverIO + tauri-driver desktop tests |

Sync flows through a self-hosted **PowerSync** service (in `docker-compose.yml`,
config in `powersync/`): it replicates Postgres down into each client's local
SQLite, and local writes replay **up** through `@pace/api`'s tRPC procedures — no
separate write backend. Auth: web via cookies, desktop via a bearer token (served
from `tauri://`), mobile via a secure-store token; PowerSync itself authenticates
with a short-lived JWT from Better Auth's JWKS.

## Prerequisites

- **Node** ≥ 24.16.0 and **pnpm** 11.9.0 (`packageManager` is pinned)
- **Docker** — Postgres, the PowerSync sync service, and its bucket storage all
  run via `docker-compose.yml`

## Quickstart

From a clean clone to a running web + API:

```bash
pnpm install
cp .env.example .env                 # then adjust values (set a Better Auth secret)
docker compose up -d                 # Postgres + PowerSync + bucket storage
pnpm --filter @pace/api db:migrate   # schema + the PowerSync replication publication
pnpm dev                             # API (:3001) + web (:3000), via Turbo
```

The web app is then at http://localhost:3000. The desktop shell and mobile app
are separate launches — see below.

## Running things

Root scripts drive the whole monorepo through Turborepo:

| Command | What it does |
|---|---|
| `pnpm dev` | API + web together — the everyday inner loop |
| `pnpm dev:api` | just the API (`:3001`) |
| `pnpm dev:web` | just the web app (`:3000`) |
| `pnpm dev:desktop` | the Tauri desktop shell — starts web *and* the native window (needs `nix develop` for the Rust/Tauri toolchain) |
| `pnpm dev:mobile` | Metro for the Expo app (needs a connected device/emulator) |
| `pnpm build` | build every workspace, in dependency order (Turbo-cached) |
| `pnpm typecheck` | typecheck all workspaces |
| `pnpm test` | unit / integration tests (API + shared schemas) |
| `pnpm check` | Biome + typecheck + tests — the pre-push gate |
| `pnpm format` | Biome autofix |

Or target one workspace from anywhere with `--filter` (e.g.
`pnpm --filter @pace/api dev`), or `cd` into it and run its own scripts.

`dev:web`, `dev:desktop`, and `dev:mobile` each need the **API reachable** — run
`pnpm dev:api` alongside (or `pnpm dev` for API + web) — plus the infra up
(`docker compose up -d` and `db:migrate`). `dev:desktop` starts its own web
server, so don't also have `dev` / `dev:web` running on `:3000`.

Default dev ports: **web** `:3000`, **API** `:3001`, **PowerSync** `:8080`,
**Postgres** `:5432`.

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
need `EXPO_PUBLIC_API_URL` **and** `EXPO_PUBLIC_POWERSYNC_URL` pointed at your
machine's LAN IP (see `apps/mobile/.env.example`). Adding a native dependency
means a fresh EAS dev build; JS-only changes are served live by Metro.

### `@pace/e2e` — `e2e`

Playwright end-to-end tests (the auth flow, web → API → Postgres, in a real browser).

| Script | Command |
|---|---|
| `test` | `playwright test` |
| `test:ui` | `playwright test --ui` |
| `typecheck` | `tsc --noEmit` |

Tests run against a **fully isolated stack** that `global-setup` brings up automatically — its own Postgres (`:5433`) and PowerSync service (`:8180`) from `docker-compose.e2e.yml`, plus the **production** API + web builds on dedicated ports (API `:3101`, web `:3100`). Nothing touches your dev database, so the suite coexists with your running dev servers; Docker just needs to be available. The tasks spec proves the real sync round-trip: a write in one browser context appears in a second, fresh one.

**NixOS browsers:** Playwright's prebuilt browsers don't run on NixOS, so the flake's dev shell wires up the nix-provided ones (`PLAYWRIGHT_BROWSERS_PATH`). Enter it first:

```bash
nix develop
pnpm --filter @pace/e2e test       # or test:ui
```

`@playwright/test` is pinned to the flake's `playwright-driver` version (both **1.59.1**) so the browser build matches — keep them in lockstep when bumping either. CI (Ubuntu) uses the standard `playwright install` instead.

### Mobile e2e — Maestro (`apps/mobile/.maestro`)

Native RN can't be driven by Playwright, so mobile flows use **Maestro** (provided by the flake, along with `adb`). Flows are YAML in `apps/mobile/.maestro/`.

Needs a device/emulator with the **dev build** installed, **Metro** running, and the app able to reach the API — set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env.local` (real device → your LAN IP; Android emulator → `http://10.0.2.2:3001`). Then:

```bash
nix develop
pnpm --filter @pace/api dev          # API the app talks to
cd apps/mobile && pnpm start         # Metro
pnpm --filter @pace/mobile test:e2e  # runs .maestro flows against the connected device
```

Elements are targeted by `testID` (`email-input`, `submit-button`, `signed-in`, …). Runs on-device/emulator only — CI (nightly emulator or a cloud device farm) is a later step.

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
