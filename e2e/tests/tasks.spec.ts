import { expect, test } from "@playwright/test"
import {
  closeDatePicker,
  dayFromToday,
  expectDaySelected,
  openDatePicker,
  pickDueDate,
} from "./date-picker"
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

  // Open the detail and set only a DATE (a clearly-past day) via the calendar — no time. The
  // regression this guards: a date-only entry must still save (it defaults to end-of-day), not
  // silently no-op the way a datetime-local input did when its time was left blank.
  const past = dayFromToday(-40)
  await page.getByText(title).click()
  await openDatePicker(page) // opening the empty field auto-selects today…
  await pickDueDate(page, past) // …which we overwrite with the past day (two clicks → single day)

  // The past due date flags the task Overdue, and no time was set. Scope the badge to the open
  // detail — a bare match could hit a leftover overdue task and let the reload race this write.
  await expect(page.getByRole("dialog").getByText("Overdue")).toBeVisible()
  await expect(page.getByLabel("Due time")).toHaveValue("")
  await closeDatePicker(page)

  // Reload a fresh page and reopen: the date stored as a UTC timestamp round-trips back to the
  // same local day — proving it reached the server and synced back. Overdue persists, and the
  // calendar marks the day selected.
  await page.reload()
  await expectSignedIn(page)
  await page.getByText(title).click()
  await expect(page.getByRole("dialog").getByText("Overdue")).toBeVisible()
  await openDatePicker(page)
  await expectDaySelected(page, past)
  // Date-only stays date-only: the end-of-day default reads as blank, a durable unset.
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

  // Set a future due date AND an explicit 23:59 — the same wall-clock a date-only entry defaults
  // to. The hasTime flag must keep it distinct from "no time".
  const due = dayFromToday(60)
  await page.getByText(title).click()
  await openDatePicker(page)
  await pickDueDate(page, due)
  await page.getByLabel("Due time").fill("23:59")
  await expect(page.getByLabel("Due time")).toHaveValue("23:59")
  await closeDatePicker(page)

  // Close the detail and confirm the ROW shows the explicit time. The row reads from the reactive
  // tasks query, so it only renders "11:59" once the write has committed to the local DB —
  // deterministically gating the reload below rather than racing an in-flight async write.
  await page.keyboard.press("Escape")
  await expect(page.getByRole("listitem").filter({ hasText: title })).toContainText("11:59")

  // After a reload the time survives (not blanked as if it were the default).
  await page.reload()
  await expectSignedIn(page)
  await page.getByText(title).click()
  await openDatePicker(page)
  await expectDaySelected(page, due)
  await expect(page.getByLabel("Due time")).toHaveValue("23:59")
})

test("the calendar popover + a preset chip set the due date (P2-08 · R5/R4)", async ({ page }) => {
  await page.goto("/")
  await expectSignedIn(page)

  const title = `Pick a date ${Date.now()}`
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()

  // Open the detail, then the react-day-picker popover from the date button.
  await page.getByText(title).click()
  await openDatePicker(page)

  // The "Tomorrow" preset chip (exact, so it can't match a day cell whose name contains it) sets
  // the due date to tomorrow and closes the popover — proving presets act beyond the auto-today.
  await page.getByRole("button", { name: "Tomorrow", exact: true }).click()
  await expect(page.getByRole("grid")).toBeHidden() // popover closed after the pick

  // Reopen: the calendar marks tomorrow selected — the preset committed the right day.
  const tomorrow = dayFromToday(1)
  await openDatePicker(page)
  await expectDaySelected(page, tomorrow)
})
