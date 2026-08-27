import { expect, type Locator, type Page } from "@playwright/test"

// Helpers for the DateRangeField (Fix Date Selector): the scheduling control is now a single button
// that opens a react-day-picker RANGE calendar in a popover (no native <input type="date"> to fill).
// A due date is picked from the calendar; the times and Repeat control live inside the popover too.
//
// Two behaviours these helpers encode:
//  • Opening the picker on an EMPTY field auto-selects TODAY. Picking another day overwrites it.
//  • The calendar is in range mode, so once a day is set (today, from the auto-select), clicking a
//    different day makes a today→day RANGE. To land a SINGLE due date you click the target day
//    TWICE — the second click collapses the range to that one day (see selectRange in the component).

const pad = (n: number) => String(n).padStart(2, "0")

// A local Date → the "YYYY-MM-DD" the calendar tags each day cell with (data-day).
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// `now` + `days` as a local YYYY-MM-DD — for building test dates relative to today (keeps the
// calendar only a month or two from its initial view, so navigation stays cheap).
export function dayFromToday(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return isoDay(d)
}

// The scheduling button inside an open task detail. Its accessible name is "Due date".
export function dueButton(scope: Page | Locator): Locator {
  return scope.getByTestId("due-date-button")
}

// Open the date popover and wait for the month grid. NOTE: on an empty field this commits today.
export async function openDatePicker(page: Page, scope: Page | Locator = page): Promise<void> {
  await dueButton(scope).click()
  await expect(page.getByRole("grid")).toBeVisible()
}

// Step the visible month until `iso`'s in-month cell is present, then return that day's button.
// Direction comes from comparing the target to any day already shown — YYYY-MM-DD sorts lexically.
async function dayCell(page: Page, iso: string): Promise<Locator> {
  const cell = page.locator(`[data-day="${iso}"]:not([data-outside])`)
  for (let i = 0; i < 240 && (await cell.count()) === 0; i++) {
    const shown = await page
      .locator("[data-day]:not([data-outside])")
      .first()
      .getAttribute("data-day")
    const dir = shown && iso < shown ? "Previous" : "Next"
    await page.getByRole("button", { name: `Go to the ${dir} Month` }).click()
  }
  await expect(cell).toHaveCount(1)
  return cell.locator("button")
}

// Set a SINGLE due date: navigate to the month and click the day twice (collapsing the auto-today
// range to just this day). Leaves the popover open for any follow-up (time, Repeat, assertions).
export async function pickDueDate(page: Page, iso: string): Promise<void> {
  const day = await dayCell(page, iso)
  await day.click()
  await day.click()
}

// Set a start→due RANGE: click the earlier day then the later day (two distinct ends).
export async function pickRange(page: Page, startIso: string, dueIso: string): Promise<void> {
  await (await dayCell(page, startIso)).click()
  await (await dayCell(page, dueIso)).click()
}

// Assert `iso` is the (a) selected day — navigating to its month first so a cross-month check
// (e.g. a due date that advanced into the next month) doesn't miss an off-screen cell. The
// calendar tags selected days with data-selected="true".
export async function expectDaySelected(page: Page, iso: string): Promise<void> {
  await dayCell(page, iso) // side effect: brings iso's month into view
  await expect(page.locator(`[data-day="${iso}"]:not([data-outside])`)).toHaveAttribute(
    "data-selected",
    "true",
  )
}

// Close the popover (Escape) and wait for the grid to go.
export async function closeDatePicker(page: Page): Promise<void> {
  await page.keyboard.press("Escape")
  await expect(page.getByRole("grid")).toBeHidden()
}
