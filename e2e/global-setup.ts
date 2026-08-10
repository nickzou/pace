import { execSync } from "node:child_process"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

// Prepare the isolated e2e stack: bring up its Postgres + PowerSync service,
// create and migrate `pace_test`, and start each run from a clean slate. URLs
// come from playwright.config.ts (evaluated first, same process). Runs before the
// web/API servers start, so the DB + publication exist before anything connects.
const here = dirname(fileURLToPath(import.meta.url))
const composeFile = resolve(here, "../docker-compose.e2e.yml")

export default async function globalSetup() {
  const baseUrl = process.env.E2E_BASE_DATABASE_URL as string
  const testUrl = process.env.TEST_DATABASE_URL as string

  // 1. Bring up the e2e Postgres (wal_level=logical) + PowerSync + bucket storage,
  //    waiting until each is healthy.
  execSync(`docker compose -f "${composeFile}" up -d --wait`, { stdio: "inherit" })

  // 2. Create the test database if it doesn't exist (CREATE DATABASE can't run in
  //    a transaction, hence a plain connection to the base db).
  const admin = postgres(baseUrl, { max: 1 })
  const existing = await admin`SELECT 1 FROM pg_database WHERE datname = 'pace_test'`
  if (existing.length === 0) {
    await admin.unsafe("CREATE DATABASE pace_test")
  }
  await admin.end()

  // 3. Apply Drizzle migrations (tables + the PowerSync publication) to pace_test.
  //    PowerSync is already retrying its connection and picks up the publication
  //    once this lands.
  execSync("pnpm --filter @pace/api db:migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  })

  // 4. Clean slate for a deterministic starting state (tasks go too, via the
  //    user FK cascade).
  const db = postgres(testUrl, { max: 1 })
  await db.unsafe('TRUNCATE "user", session, account, verification CASCADE')
  await db.end()
}
