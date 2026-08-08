import { type ChildProcess, execSync, spawn } from "node:child_process"
import { dirname, resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"
import postgres from "postgres"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "..")

// Local dev reads Postgres creds from the repo-root .env; CI sets DATABASE_URL
// in the environment (dotenv won't override an already-set var).
loadEnv({ path: resolve(repoRoot, ".env") })

// Dedicated port/DB so the desktop suite coexists with the dev servers. Reuses
// the Playwright suite's API port (3101) + pace_test DB — they never run at once.
const API = "http://localhost:3101"
const API_PORT = "3101"

const BASE_DB_URL =
  process.env.DATABASE_URL ?? "postgresql://pace:pace_dev_password@localhost:5432/pace"
const testDbUrl = new URL(BASE_DB_URL)
testDbUrl.pathname = "/pace_test"
const TEST_DB_URL = testDbUrl.toString()

// The packaged app is served from tauri://localhost; the API must trust that
// origin (Better Auth's CSRF check + our CORS echo) or sign-up/in are rejected.
const DESKTOP_ORIGIN = "tauri://localhost"

// The debug binary from `pnpm build:app` (cargo package name is `app`).
const APP_BINARY = resolve(repoRoot, "apps/web/src-tauri/target/debug/app")

// tauri-driver (cargo-installed) proxies wdio ⇆ WebKitWebDriver. On NixOS
// WebKitWebDriver isn't on PATH; the flake exports its store path.
const TAURI_DRIVER = resolve(process.env.HOME ?? "", ".cargo/bin/tauri-driver")
const NATIVE_DRIVER = process.env.WEBKIT_WEB_DRIVER

let apiProc: ChildProcess | undefined
let tauriDriver: ChildProcess | undefined

async function resetDb(): Promise<void> {
  const admin = postgres(BASE_DB_URL, { max: 1 })
  const existing = await admin`SELECT 1 FROM pg_database WHERE datname = 'pace_test'`
  if (existing.length === 0) await admin.unsafe("CREATE DATABASE pace_test")
  await admin.end()

  execSync("pnpm --filter @pace/api db:migrate", {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  })

  const db = postgres(TEST_DB_URL, { max: 1 })
  await db.unsafe('TRUNCATE "user", session, account, verification CASCADE')
  await db.end()
}

async function waitForHealth(url: string, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // not up yet
    }
    await sleep(1000)
  }
  throw new Error(`API never became healthy at ${url}`)
}

async function startApi(): Promise<void> {
  // Build + run the API's production output against pace_test (mirrors the
  // Playwright harness — test the built artifact, not the dev server).
  execSync("pnpm --filter @pace/api build", { cwd: repoRoot, stdio: "inherit" })
  apiProc = spawn("pnpm", ["--filter", "@pace/api", "start"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: TEST_DB_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "desktop-e2e-secret",
      BETTER_AUTH_URL: API,
      TRUSTED_ORIGINS: DESKTOP_ORIGIN,
      PORT: API_PORT,
    },
  })
  await waitForHealth(`${API}/health`)
}

export const config: WebdriverIO.Config = {
  runner: "local",
  // Talk directly to tauri-driver (spawned in beforeSession) — no managed driver.
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",

  specs: ["./test/specs/**/*.e2e.ts"],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      // tauri-driver only speaks WebDriver Classic; wdio v9 defaults to BiDi.
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": { application: APP_BINARY },
    } as WebdriverIO.Capabilities,
  ],

  logLevel: "info",
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 120_000 },

  // Reset the DB and bring up the API once, before any session.
  onPrepare: async () => {
    if (!NATIVE_DRIVER) {
      throw new Error(
        "WEBKIT_WEB_DRIVER is not set — run inside `nix develop` (the flake exports it).",
      )
    }
    await resetDb()
    await startApi()
  },

  // tauri-driver bridges wdio ⇆ the app's WebKitWebView; spawn it per session
  // and give it a moment to start listening on :4444.
  beforeSession: async () => {
    tauriDriver = spawn(
      TAURI_DRIVER,
      ["--port", "4444", "--native-driver", NATIVE_DRIVER as string],
      { stdio: [null, process.stdout, process.stderr] },
    )
    await sleep(1500)
  },

  afterSession: () => {
    tauriDriver?.kill()
  },

  onComplete: () => {
    apiProc?.kill()
  },
}
