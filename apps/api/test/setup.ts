import { fileURLToPath } from "node:url"
import { config } from "dotenv"

// Load repo-root .env (DATABASE_URL + auth vars) for local runs, without
// overriding anything CI already set in the environment.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) })

// Force every test onto the dedicated pace_test database — never the dev one.
const base = process.env.DATABASE_URL ?? "postgresql://pace:pace_dev_password@localhost:5432/pace"
const url = new URL(base)
url.pathname = "/pace_test"
process.env.DATABASE_URL = url.toString()

// Safety net: these tests TRUNCATE tables, so refuse to run anywhere else.
if (!process.env.DATABASE_URL.endsWith("/pace_test")) {
  throw new Error(
    `Refusing to run: DATABASE_URL is ${process.env.DATABASE_URL}, expected the pace_test database.`,
  )
}
