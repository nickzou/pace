import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"
import { config as loadEnv } from "dotenv"

// Local dev reads Postgres creds from the repo-root .env; CI sets DATABASE_URL
// in the environment (dotenv won't override an already-set var).
const here = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(here, "../.env") })

const BASE_DB_URL =
  process.env.DATABASE_URL ?? "postgresql://pace:pace_dev_password@localhost:5432/pace"

// Tests run against a dedicated database, never the dev one.
const testDbUrl = new URL(BASE_DB_URL)
testDbUrl.pathname = "/pace_test"
const TEST_DB_URL = testDbUrl.toString()
// Hand the derived URL to global-setup (same process, evaluated first).
process.env.TEST_DATABASE_URL = TEST_DB_URL

// Dedicated ports so the e2e stack coexists with dev servers (web :3000 / API
// :3001) — run tests without stopping whatever you're developing.
const WEB = "http://localhost:3100"
const API = "http://localhost:3101"

export default defineConfig({
  testDir: "./tests",
  // Auth tests share one database; keep them serial + deterministic for now.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  globalSetup: "./global-setup.ts",

  use: {
    baseURL: WEB,
    trace: "on-first-retry",
  },

  projects: [
    // Programmatic login → saves an authenticated storageState other specs reuse.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  // Both servers are built and served as their production output (not the dev
  // servers) against the pace_test DB. Reasons: (1) the web dev server's
  // on-demand dep optimization races the first navigation and leaves the page
  // un-hydrated; (2) a built server has no file-watcher, which is unpredictable
  // in a long-lived `--ui` watch session. Test the artifact.
  //
  // On dedicated ports, so reuse is safe (nothing else uses them): faster local
  // re-runs, fresh servers in CI. Restart the run after changing app code.
  webServer: [
    {
      command: "pnpm --filter @pace/api build && pnpm --filter @pace/api start",
      port: 3101,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL: TEST_DB_URL,
        BETTER_AUTH_URL: API,
        TRUSTED_ORIGINS: WEB,
        PORT: "3101",
      },
    },
    {
      command: "pnpm --filter @pace/web build && pnpm --filter @pace/web start",
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // VITE_API_URL is baked into the build; PORT is read by the node server.
      env: { VITE_API_URL: API, PORT: "3100" },
    },
  ],
})
