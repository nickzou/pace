import { resolve } from "node:path"
import { config } from "dotenv"

// The repo-root .env is the single source of truth (see docker-compose.yml).
// Anchored to cwd (always apps/api for `pnpm dev` / drizzle-kit / the auth CLI)
// rather than import.meta.url, which Nitro relocates when it bundles the server.
// In production these come from the container env, so a missing file is fine.
config({ path: resolve(process.cwd(), "../../.env") })

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: required("BETTER_AUTH_URL"),
  // Comma-separated web origins allowed to call the auth API (CORS + Better
  // Auth's own origin check). Dev default is the web app on :3000.
  TRUSTED_ORIGINS: optional("TRUSTED_ORIGINS", "http://localhost:3000"),
}
