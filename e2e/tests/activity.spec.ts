import { expect, test } from "@playwright/test"
import { closeDatePicker, dayFromToday, openDatePicker, pickDueDate } from "./date-picker"
import { expectSignedIn } from "./helpers"

// Reuses the session saved by auth.setup.ts — the tasks list is auth-gated.
test.use({ storageState: "playwright/.auth/user.json" })

// P3-08 verify checkpoint: rescheduling a task records durable, per-task activity — the data the
// reschedule analytics later builds on. On the Desktop Chrome viewport the detail shows the
// persistent Activity panel (wireframe 2), so entries render without expanding anything.
test("rescheduling a task twice records due-date activity that survives a reload", async ({
  page,
}) => {
  await page.goto("/")
  await expectSignedIn(page)

  const title = `Reschedule me ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()

  const dialog = page.getByRole("dialog")
  await page.getByText(title).click()
  await expect(dialog).toBeVisible()

  // Creating the task is itself logged.
  await expect(dialog.getByText("Created this task")).toBeVisible()

  // Set a due date, then reschedule it to a later day — at least two due_changed events (opening
  // an empty picker also commits today, so the exact count is a lower bound, not fixed).
  await openDatePicker(page)
  await pickDueDate(page, dayFromToday(3))
  await closeDatePicker(page)

  await openDatePicker(page)
  await pickDueDate(page, dayFromToday(10))
  await closeDatePicker(page)

  // The move reads as a reschedule, and the feed holds ≥2 due-date entries.
  await expect(dialog.getByText(/Rescheduled the due date to/i).first()).toBeVisible()
  await expect
    .poll(async () => dialog.getByText(/the due date to/i).count())
    .toBeGreaterThanOrEqual(2)

  // Reload from scratch and reopen: the entries reached Postgres and synced back down — not just
  // an optimistic blip in the local cache.
  await page.reload()
  await expectSignedIn(page)
  await page.getByText(title).click()
  await expect(dialog.getByText("Created this task")).toBeVisible()
  await expect
    .poll(async () => dialog.getByText(/the due date to/i).count())
    .toBeGreaterThanOrEqual(2)
})
