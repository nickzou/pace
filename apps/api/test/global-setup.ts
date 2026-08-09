import { execSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { config } from "dotenv"
import postgres from "postgres"

// Retry until Postgres accepts an authenticated connection. In CI the service's
// healthcheck can pass on its bootstrap server before the password role exists,
// so the first real connect may fail with 28P01.
async function waitForPostgres(url: string, tries = 30): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const sql = postgres(url, { max: 1, onnotice: () => {} })
    try {
      await sql`SELECT 1`
      await sql.end()
      return
    } catch {
      await sql.end({ timeout: 5 }).catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw new Error(`Postgres never became ready at ${url}`)
}

// Create + migrate the dedicated pace_test database once, before the suite.
// Mirrors the Playwright harness's global-setup.
export default async function globalSetup() {
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) })
  const base = process.env.DATABASE_URL ?? "postgresql://pace:pace_dev_password@localhost:5432/pace"
  const testUrl = new URL(base)
  testUrl.pathname = "/pace_test"

  await waitForPostgres(base)

  // CREATE DATABASE can't run in a transaction, so use a plain connection to the base db.
  const admin = postgres(base, { max: 1 })
  const exists = await admin`SELECT 1 FROM pg_database WHERE datname = 'pace_test'`
  if (exists.length === 0) await admin.unsafe("CREATE DATABASE pace_test")
  await admin.end()

  execSync("pnpm --filter @pace/api db:migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
  })
}
