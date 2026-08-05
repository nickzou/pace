import { expect, test } from "@playwright/test"

// Reuses the session saved by auth.setup.ts — no login here. This is the
// pattern every future "needs a logged-in user" test will follow, so the login
// UI is exercised once (auth-flow.spec.ts) and everything else is fast.
test.use({ storageState: "playwright/.auth/user.json" })

test("saved session renders the signed-in home", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText(/signed in as/i)).toBeVisible()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
})
