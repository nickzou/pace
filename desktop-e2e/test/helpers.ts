// Shared with the Playwright/Maestro suites in spirit: a fixed password and a
// unique email per call so a run never collides with itself (the DB is
// truncated once at the start of the run, in wdio.conf's onPrepare).
export const PASSWORD = "Supersecret123!"

let counter = 0
export function uniqueEmail(tag: string): string {
  counter += 1
  return `${tag}-${Date.now()}-${counter}@pace.test`
}
