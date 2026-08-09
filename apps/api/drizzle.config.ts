import { resolve } from "node:path"
import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// drizzle-kit only needs the connection string — not the auth env — so we read
// DATABASE_URL directly rather than importing the full (auth-requiring) env.
// Load the repo-root .env for local use; a no-op in CI, where DATABASE_URL is
// already in the environment.
config({ path: resolve(process.cwd(), "../../.env") })

const url = process.env.DATABASE_URL
if (!url) throw new Error("Missing required env var: DATABASE_URL")

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/tasks.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
})
