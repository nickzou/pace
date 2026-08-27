import { expect, type Page, test } from "@playwright/test"
import {
  closeDatePicker,
  dayFromToday,
  expectDaySelected,
  isoDay,
  openDatePicker,
  pickDueDate,
} from "./date-picker"
import { expectSignedIn, PASSWORD, uniqueEmail } from "./helpers"

// P2-08 · Repeating tasks, end to end through the real stack: set a task to repeat in the detail,
// complete it, and confirm the server regenerated the next occurrence and it synced back — plus the
// calendar's ghost projections. Sync-heavy (fresh signup + completion round-trip + reload).
test.beforeEach(() => test.slow())

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Recurrence User")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()
  await expectSignedIn(page, email)
}

async function addTask(page: Page, title: string): Promise<void> {
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
}

test("weekly repeat (advance): completing reschedules the task one week out and reopens it", async ({
  page,
}) => {
  await signUp(page, uniqueEmail("rec-advance"))
  const title = `Weekly ${Date.now()}`
  await addTask(page, title)

  // Open the detail, give it a due date via the calendar, and set it to repeat weekly (advance is
  // the default mode). The Repeat control lives in the date popover, so set it while that's open.
  const due = dayFromToday(20)
  const dueNext = dayFromToday(27) // advance = the next weekly occurrence, i.e. due + 7 days
  await page.getByText(title, { exact: true }).click()
  const dialog = page.getByRole("dialog")
  await openDatePicker(page)
  await pickDueDate(page, due)
  // Reopen before setting Repeat so the control anchors the rule to the now-committed due date —
  // set in the same popover pass, its self-query hasn't settled and the anchor would be stale.
  await closeDatePicker(page)
  await openDatePicker(page)
  await page.getByLabel("Repeat frequency").selectOption("weekly")
  await expect(page.getByText(/Repeats every week/i)).toBeVisible()
  await closeDatePicker(page)

  // Complete it via the status control → Done. The server advances the due a week and reopens it.
  await dialog.getByRole("button", { name: "To Do" }).click()
  await page.getByRole("menuitem", { name: "Done" }).click()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()

  // The reschedule round-trips through the server; reload to pull it back down, then reopen and
  // assert the due moved a week out and the task is open again (To Do), not done.
  await expect(async () => {
    await page.reload()
    await expectSignedIn(page)
    await page.getByText(title, { exact: true }).click()
    const d = page.getByRole("dialog")
    await expect(d.getByRole("button", { name: "To Do" })).toBeVisible()
    await openDatePicker(page)
    await expectDaySelected(page, dueNext)
  }).toPass({ timeout: 30_000 })
})

test("a repeating task shows ghost occurrences on the calendar", async ({ page }) => {
  await signUp(page, uniqueEmail("rec-ghosts"))
  const title = `Ghosty ${Date.now()}`
  await addTask(page, title)

  // Anchor the due date to the 1st of the current month so the weekly ghosts (8th/15th/22nd/29th)
  // all land within the calendar's default (current) month view.
  const now = new Date()
  const firstOfMonth = isoDay(new Date(now.getFullYear(), now.getMonth(), 1))
  await page.getByText(title, { exact: true }).click()
  const dialog = page.getByRole("dialog")
  await openDatePicker(page)
  await pickDueDate(page, firstOfMonth)
  await page.getByLabel("Repeat frequency").selectOption("weekly")
  await expect(page.getByText(/Repeats every week/i)).toBeVisible()
  await closeDatePicker(page)
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()

  // Switch to the calendar view — the repeating task projects faded ghost events across the month.
  await page.getByRole("tab", { name: "Calendar" }).click()
  await expect(page.locator(".fc-ghost").first()).toBeVisible({ timeout: 15_000 })
})
