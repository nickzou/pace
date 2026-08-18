import { expect, test } from "@playwright/test"
import { enableCustomStatuses, expectSignedIn } from "./helpers"

// P2-03 · Custom statuses. Reuses the session saved by auth.setup.ts.
test.use({ storageState: "playwright/.auth/user.json" })

// Sync-heavy (settings + groups + statuses cold-sync in CI) — give headroom.
test.beforeEach(() => test.slow())

// The end-to-end flow the feature exists for: define a custom DONE status in
// Settings, assign it to a task from the list, and confirm the task reads as done
// (title struck through) — then reload to prove the status reached Postgres and
// resolved_at was derived server-side from the done category, not just cached locally.
test("create a custom done status, assign it in the list → task reads as done and persists", async ({
  page,
}) => {
  const stamp = Date.now()
  const statusName = `Shipped ${stamp}`

  // 1. Settings — enable custom statuses (gated behind the toggle; the helper waits for
  //    user_settings to sync before toggling), then add a DONE status to the default group.
  await enableCustomStatuses(page)

  // Scope to the seeded default group's block — other specs in the run leave extra
  // groups behind (the DB is truncated once per run, tests run serially), so the bare
  // placeholder/category/Add would be ambiguous across groups.
  const defaultBlock = page
    .locator("div.rounded-lg")
    .filter({ has: page.getByLabel("Rename Default list") })
  await defaultBlock.getByPlaceholder("New status…").fill(statusName)
  await defaultBlock.getByLabel("Category").selectOption("done")
  await defaultBlock.getByRole("button", { name: "green", exact: true }).click() // a palette colour
  await defaultBlock.getByRole("button", { name: "Add", exact: true }).click()

  // It lands in the group's status list. (The name is an editable field now — P2-03
  // polish — so assert the row's rename input, not static text.)
  await expect(page.getByLabel(`Rename ${statusName}`)).toBeVisible()

  // 2. List — add a task. It starts on the default open status "To Do" and is not done.
  await page.goto("/")
  await expectSignedIn(page)

  const title = `Ship it ${stamp}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add", exact: true }).click()

  const row = page.getByRole("listitem").filter({ hasText: title })
  await expect(row.getByRole("button", { name: "To Do" })).toBeVisible()
  await expect(row.getByText(title)).not.toHaveClass(/line-through/)

  // 3. Open the status picker (portalled — not clipped by the row) and pick the
  //    custom done status.
  await row.getByRole("button", { name: "To Do" }).click()
  await page.getByRole("menuitem", { name: statusName }).click()

  // The chip updates and the task now reads as done (title struck through).
  await expect(row.getByRole("button", { name: statusName })).toBeVisible()
  await expect(row.getByText(title)).toHaveClass(/line-through/)

  // 4. Reload from scratch: the assignment round-tripped through Postgres and synced
  //    back, so it's still the custom done status and still struck through.
  await page.reload()
  await expectSignedIn(page)
  const rowAfter = page.getByRole("listitem").filter({ hasText: title })
  await expect(rowAfter.getByRole("button", { name: statusName })).toBeVisible()
  await expect(rowAfter.getByText(title)).toHaveClass(/line-through/)
})
