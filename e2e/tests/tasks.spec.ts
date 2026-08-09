import { expect, test } from "@playwright/test"

// Reuses the session saved by auth.setup.ts — the tasks list is auth-gated.
test.use({ storageState: "playwright/.auth/user.json" })

test("add a task → it appears in the list and survives a reload", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText(/signed in as/i)).toBeVisible()

  const title = `Buy milk ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()

  // Appears (optimistic update + server round-trip).
  await expect(page.getByText(title)).toBeVisible()

  // Reload from scratch: proves it actually reached Postgres, not just the
  // optimistic cache (a failed create would have rolled back and vanished).
  await page.reload()
  await expect(page.getByText(/signed in as/i)).toBeVisible()
  await expect(page.getByText(title)).toBeVisible()
})
