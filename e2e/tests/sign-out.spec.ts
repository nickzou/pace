import { expect, test } from "@playwright/test"
import { expectSignedIn, expectSignedOut, PASSWORD, uniqueEmail } from "./helpers"

// Regression guard for the sign-out bug (the signed-in gate once got stuck, so
// tapping "Sign out" did nothing). Confirms sign-out actually leaves the signed-in
// state — the signed-in affordances disappear — and that it *sticks* across a
// reload, proving the session cookie was really cleared, not just hidden.
//
// Signs up its own throwaway user so signing it out can't disturb the shared
// storageState the other specs reuse.
test("sign out → confirmed signed out, and stays out on reload", async ({ page }) => {
  const email = uniqueEmail("signout")

  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Sign Out User")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByLabel("Confirm password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()
  await expectSignedIn(page, email)

  await page.getByRole("button", { name: "Sign out" }).click()

  // Confirmed out: the signed-out prompt shows and the signed-in UI is gone.
  await expectSignedOut(page)
  await expect(page.getByRole("link", { name: email })).toBeHidden()

  // The cookie was actually cleared, so a fresh load stays signed out.
  await page.reload()
  await expectSignedOut(page)
})
