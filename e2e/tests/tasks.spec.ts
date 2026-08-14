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

test("delete a task → the Undo toast restores it (offline-first round-trip)", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByText(/signed in as/i)).toBeVisible()

  const title = `Undo me ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()

  // Delete via this row's ✕ (scoped so we hit the right task among any others).
  const row = page.getByRole("listitem").filter({ hasText: title })
  await row.getByRole("button", { name: "Delete task" }).click()

  // It leaves the list (replays as softDelete) and an Undo toast appears.
  await expect(page.getByText(title)).toBeHidden()
  await expect(page.getByText("Task deleted")).toBeVisible()

  // Undo re-inserts the row → replays as create, whose upsert clears deletedAt.
  await page.getByRole("button", { name: "Undo" }).click()
  await expect(page.getByText(title)).toBeVisible()

  // Reload proves the restore actually persisted (tombstone cleared), not a blip.
  await page.reload()
  await expect(page.getByText(/signed in as/i)).toBeVisible()
  await expect(page.getByText(title)).toBeVisible()
})
