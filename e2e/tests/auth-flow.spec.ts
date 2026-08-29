import { test } from "@playwright/test"
import { expectSignedIn, expectSignedOut, PASSWORD, uniqueEmail } from "./helpers"

// The one test that drives the auth UI end to end through a real browser.
test("sign up → signed in → sign out → sign in (through the UI)", async ({ page }) => {
  const email = uniqueEmail("flow")

  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Flow User")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()

  // Redirected home, authenticated as the new user.
  await expectSignedIn(page, email)

  await page.getByRole("button", { name: "Sign out" }).click()
  await expectSignedOut(page)

  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()

  await expectSignedIn(page, email)
})
