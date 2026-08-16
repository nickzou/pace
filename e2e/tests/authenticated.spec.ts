import { test } from "@playwright/test"
import { expectSignedIn } from "./helpers"

// Reuses the session saved by auth.setup.ts — no login here. This is the
// pattern every future "needs a logged-in user" test will follow, so the login
// UI is exercised once (auth-flow.spec.ts) and everything else is fast.
test.use({ storageState: "playwright/.auth/user.json" })

test("saved session renders the signed-in home", async ({ page }) => {
  await page.goto("/")
  await expectSignedIn(page)
})
