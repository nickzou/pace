import { defineConfig, devices } from "@playwright/test"

// The e2e stack is fully self-contained (docker-compose.e2e.yml): its own Postgres
// on 5433 (never the dev DB) plus a PowerSync service on 8180. global-setup.ts
// brings it up before the run. Point everything here at it, so a run behaves
// identically locally and in CI and never touches whatever you're developing.
const BASE_DB_URL = "postgresql://pace:pace@localhost:5433/pace"
const testDbUrl = new URL(BASE_DB_URL)
testDbUrl.pathname = "/pace_test"
const TEST_DB_URL = testDbUrl.toString()
// Hand the URLs to global-setup (same process, evaluated first).
process.env.E2E_BASE_DATABASE_URL = BASE_DB_URL
process.env.TEST_DATABASE_URL = TEST_DB_URL

// Dedicated ports so the e2e stack coexists with the dev servers (web :3000 /
// API :3001 / PowerSync :8080).
const WEB = "http://localhost:3100"
const API = "http://localhost:3101"
const POWERSYNC_URL = "http://localhost:8180"

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
        // Keep the auth flow email-free and hermetic: pin verification OFF so the run never
        // depends on the dev repo-root .env (which turns it ON to exercise the feature). Without
        // this, sign-up creates no session locally and every spec loads signed-out. CI has no
        // .env, so it already defaulted off — this just makes local match CI.
        REQUIRE_EMAIL_VERIFICATION: "false",
      },
    },
    {
      command: "pnpm --filter @pace/web build && pnpm --filter @pace/web start",
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // VITE_* are baked into the build; PORT is read by the node server. The web
      // app syncs through the e2e PowerSync service (docker-compose.e2e.yml :8180).
      env: { VITE_API_URL: API, VITE_POWERSYNC_URL: POWERSYNC_URL, PORT: "3100" },
    },
  ],
})
