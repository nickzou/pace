import { execSync } from "node:child_process"
import postgres from "postgres"

// Prepare an isolated `pace_test` database: create it, migrate it, and start
// each run from a clean slate. Derived URLs come from playwright.config.ts.
export default async function globalSetup() {
  const baseUrl =
    process.env.DATABASE_URL ?? "postgresql://pace:pace_dev_password@localhost:5432/pace"
  const testUrl = process.env.TEST_DATABASE_URL as string

  // 1. Create the test database if it doesn't exist (CREATE DATABASE can't run
  //    in a transaction, hence a plain connection to the base db).
  const admin = postgres(baseUrl, { max: 1 })
  const existing = await admin`SELECT 1 FROM pg_database WHERE datname = 'pace_test'`
  if (existing.length === 0) {
    await admin.unsafe("CREATE DATABASE pace_test")
  }
  await admin.end()

  // 2. Apply Drizzle migrations to the test database.
  execSync("pnpm --filter @pace/api db:migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  })

  // 3. Clean slate for a deterministic starting state.
  const db = postgres(testUrl, { max: 1 })
  await db.unsafe('TRUNCATE "user", session, account, verification CASCADE')
  await db.end()
}
