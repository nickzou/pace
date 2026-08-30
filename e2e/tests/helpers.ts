import { expect, type Page } from "@playwright/test"

// Dedicated e2e ports so the suite never collides with dev servers (web :3000 /
// API :3001) — see playwright.config.ts.
export const API_URL = "http://localhost:3101"
export const WEB_ORIGIN = "http://localhost:3100"
export const PASSWORD = "Supersecret123!"

// Unique per call so tests don't collide within a run (the DB is truncated once
// at the start of the run, in global-setup).
let counter = 0
export function uniqueEmail(tag: string): string {
  counter += 1
  return `${tag}-${Date.now()}-${counter}@pace.test`
}

// Assert the app is in its signed-in / signed-out state by the semantic controls
// each offers, not by specific markup — so these survive UI reshuffles (the whole
// reason the P2-10 shell redesign broke the old text assertions).
//
// The signed-in shell renders its sidebar nav TWICE (desktop rail + off-screen
// mobile sheet), but role queries ignore hidden elements by default, so the
// off-breakpoint copy (display:none via `md:hidden`) is skipped automatically —
// no container scoping needed. The account email is exposed as the accessible name
// of the /settings link; Sign out is an icon button labelled via aria-label.
export async function expectSignedIn(page: Page, email?: string): Promise<void> {
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
  if (email) await expect(page.getByRole("link", { name: email })).toBeVisible()
}

// Signed-out home offers a Sign-in affordance and none of the signed-in controls.
export async function expectSignedOut(page: Page): Promise<void> {
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden()
}

// Turn on custom statuses from /settings (P2-03), robust to cold PowerSync sync. The
// toggle is `disabled` until user_settings syncs down — in CI each test starts with an
// empty local DB, so that can take well over the default 5s expect timeout. Wait for the
// toggle to be enabled (real value loaded) BEFORE reading/clicking it: acting on the
// pre-sync default both misfires under slow sync and can clobber an already-on value
// (e.g. when an earlier spec enabled it and the server already says true). Idempotent.
export async function enableCustomStatuses(page: Page): Promise<void> {
  // Statuses live under the Task Defaults tab; the tab is a URL param so we deep-link to it.
  await page.goto("/settings?tab=task-defaults")
  const toggle = page.getByRole("switch", { name: "Enable custom statuses" })
  await expect(toggle).toBeEnabled({ timeout: 30_000 })
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  // Gate on the management UI actually rendering so callers don't race the re-render.
  await expect(page.getByPlaceholder("New status list…")).toBeVisible()
}
