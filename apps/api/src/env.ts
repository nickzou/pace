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

function optionalBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]
  if (value === undefined) return fallback
  return value === "true" || value === "1"
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: required("BETTER_AUTH_URL"),
  // Comma-separated web origins allowed to call the auth API (CORS + Better
  // Auth's own origin check). Dev default is the web app on :3000.
  TRUSTED_ORIGINS: optional("TRUSTED_ORIGINS", "http://localhost:3000"),
  // Public web app origin — verification links always point here (never at
  // tauri:// or a mobile scheme), so the same link works from any platform.
  // Defaults to the first trusted origin's usual dev value.
  WEB_URL: optional("WEB_URL", "http://localhost:3000"),
  // Email verification gate. Kept behind a flag so it can ship dark and only be
  // enabled per-environment once existing users are backfilled (see Phase 5).
  // When true, sign-up creates no session and sends a verification email; sign-in
  // is blocked until the address is verified.
  REQUIRE_EMAIL_VERIFICATION: optionalBool("REQUIRE_EMAIL_VERIFICATION", false),
  // Transactional email over SMTP (nodemailer). Dev/CI/preview point at Mailpit
  // (no auth); prod points at Resend (smtp.resend.com:587, user "resend", pass =
  // the Resend API key). Same code path everywhere — only these values change.
  SMTP_HOST: optional("SMTP_HOST", "localhost"),
  SMTP_PORT: Number(optional("SMTP_PORT", "1025")),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: optional("EMAIL_FROM", "Pace <no-reply@pace.local>"),
}
