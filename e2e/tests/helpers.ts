// Dedicated e2e ports so the suite never collides with dev servers (web :3000 /
// API :3001) — see playwright.config.ts.
export const API_URL = "http://localhost:3101"
export const WEB_ORIGIN = "http://localhost:3100"
export const PASSWORD = "supersecret123"

// Unique per call so tests don't collide within a run (the DB is truncated once
// at the start of the run, in global-setup).
let counter = 0
export function uniqueEmail(tag: string): string {
  counter += 1
  return `${tag}-${Date.now()}-${counter}@pace.test`
}
