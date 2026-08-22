import { expect, test } from "@playwright/test"
import { expectSignedIn } from "./helpers"

// Reuses the session saved by auth.setup.ts — the tasks list is auth-gated.
test.use({ storageState: "playwright/.auth/user.json" })

test("add a task → it appears in the list and survives a reload", async ({ page }) => {
  await page.goto("/")
  await expectSignedIn(page)

  const title = `Buy milk ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()

  // Appears (optimistic update + server round-trip).
  await expect(page.getByText(title)).toBeVisible()

  // Reload from scratch: proves it actually reached Postgres, not just the
  // optimistic cache (a failed create would have rolled back and vanished).
  await page.reload()
  await expectSignedIn(page)
  await expect(page.getByText(title)).toBeVisible()
})

test("delete a task → the Undo toast restores it (offline-first round-trip)", async ({ page }) => {
  await page.goto("/")
  await expectSignedIn(page)

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
  await expectSignedIn(page)
  await expect(page.getByText(title)).toBeVisible()
})

test("set a past due DATE only (no time) → it saves, is flagged Overdue, and round-trips a reload", async ({
  page,
}) => {
  await page.goto("/")
  await expectSignedIn(page)

  const title = `Schedule me ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()

  // Open the detail and set only the DATE — no time. The regression this guards:
  // a date-only entry must still save (it defaults to end-of-day), not silently
  // no-op the way a single datetime-local input did when its time was left blank.
  await page.getByText(title).click()
  const due = page.getByLabel("Due date")
  await due.fill("2020-01-01")

  // The date is held, and the past due date flags the task Overdue. Scope the badge to the
  // open detail — a bare .first() could match a leftover overdue task and let the reload race
  // this task's still-in-flight write.
  await expect(due).toHaveValue("2020-01-01")
  await expect(page.getByRole("dialog").getByText("Overdue")).toBeVisible()

  // Reload a fresh page and reopen: the date stored as a UTC timestamp round-trips
  // back to the same local day — proving it reached the server and synced back.
  await page.reload()
  await expectSignedIn(page)
  await page.getByText(title).click()
  await expect(page.getByLabel("Due date")).toHaveValue("2020-01-01")
  // Date-only stays date-only: the end-of-day default reads as blank, so the time
  // is a durable unset rather than reappearing as 23:59 on reload.
  await expect(page.getByLabel("Due time")).toHaveValue("")
})

test("an explicit time equal to the no-time default (11:59 PM) is kept, not swallowed", async ({
  page,
}) => {
  await page.goto("/")
  await expectSignedIn(page)

  const title = `Time me ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()

  // Set a due date AND an explicit 23:59 — the same wall-clock a date-only entry
  // defaults to. The hasTime flag must keep it distinct from "no time".
  await page.getByText(title).click()
  await page.getByLabel("Due date").fill("2030-06-15")
  await page.getByLabel("Due time").fill("23:59")
  await expect(page.getByLabel("Due time")).toHaveValue("23:59")

  // Close the detail and confirm the ROW shows the explicit time. The row reads from the
  // reactive tasks query, so it only renders "11:59" once the write has committed to the
  // local DB — deterministically gating the reload below rather than racing an in-flight
  // async write (which, under load, could otherwise reload before the write lands).
  await page.keyboard.press("Escape")
  await expect(page.getByRole("listitem").filter({ hasText: title })).toContainText("11:59")

  // After a reload the time survives (not blanked as if it were the default).
  await page.reload()
  await expectSignedIn(page)
  await page.getByText(title).click()
  await expect(page.getByLabel("Due date")).toHaveValue("2030-06-15")
  await expect(page.getByLabel("Due time")).toHaveValue("23:59")
})

test("the calendar popover + a preset chip set the due date (P2-08 · R5/R4)", async ({ page }) => {
  await page.goto("/")
  await expectSignedIn(page)

  const title = `Pick a date ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()

  // Open the detail, then the react-day-picker popover from the calendar button.
  await page.getByText(title).click()
  await page.getByTestId("due-date-calendar").click()
  await expect(page.getByRole("grid")).toBeVisible() // the month grid rendered

  // The "Today" preset chip (exact, so it can't match a day cell whose name contains "Today")
  // sets the due date to the local today and closes the popover.
  await page.getByRole("button", { name: "Today", exact: true }).click()
  const pad = (n: number) => String(n).padStart(2, "0")
  const now = new Date()
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  await expect(page.getByLabel("Due date")).toHaveValue(today)
  await expect(page.getByRole("grid")).toBeHidden() // popover closed after the pick
})
