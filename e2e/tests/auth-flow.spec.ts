import { expect, test } from "@playwright/test"
import { PASSWORD, uniqueEmail } from "./helpers"

// The one test that drives the auth UI end to end through a real browser.
test("sign up → signed in → sign out → sign in (through the UI)", async ({ page }) => {
  const email = uniqueEmail("flow")

  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Flow User")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()

  // Redirected home, authenticated as the new user.
  await expect(page.getByText(email)).toBeVisible()

  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page.getByText(/you're not signed in/i)).toBeVisible()

  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page.getByText(email)).toBeVisible()
})
