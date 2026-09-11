import { expect, test } from "@playwright/test"
import { expectSignedIn, PASSWORD, uniqueEmail } from "./helpers"

// Delete Account grace-period round-trip through the real UI: request deletion (reauth), get
// signed out everywhere, then sign back in within the window to cancel it — with data intact.
// A fresh account per run (it gets deleted), so no shared storageState.
test("request deletion signs out; signing back in cancels it (data intact)", async ({ page }) => {
  const email = uniqueEmail("del")

  // Fresh account, signed in.
  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Del User")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByLabel("Confirm password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()
  await expectSignedIn(page, email)

  // A task — to prove data survives the grace period and re-syncs after reactivation.
  const title = `Keep me ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()

  // Danger zone → confirm modal (password + typed DELETE).
  await page.goto("/settings?tab=account")
  await page.getByRole("button", { name: "Delete account…" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.locator("#del-password").fill(PASSWORD)
  await dialog.locator("#del-confirm").fill("DELETE")
  await dialog.getByRole("button", { name: "Delete account", exact: true }).click()

  // Armed → signed out and redirected to sign-in (sessions revoked server-side).
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 10_000 })

  // Sign back in within the window → deletion cancelled (session.create hook), account restored.
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expectSignedIn(page, email)

  // The task re-synced from the server — data was never lost.
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 })
})
