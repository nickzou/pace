import { expect, type Page, test } from "@playwright/test"
import { expectSignedIn, PASSWORD, uniqueEmail } from "./helpers"

// P2-07 · Multiview (list / table / calendar / board). Happy-path coverage of the seams the unit
// tests can't reach: the layout facet in the URL + localStorage, subtasks surfacing across views,
// the board as a live view of the shared query, and the mobile calendar shelf. Each test signs up
// a FRESH user so the board/list hold only its tasks. Sync-heavy (signup + cold sync + reload).
test.beforeEach(() => test.slow())

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Multiview User")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()
  await expectSignedIn(page, email)
}

async function addTopLevel(page: Page, title: string): Promise<void> {
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name })

test("layout choice rides the URL and sticks via localStorage", async ({ page }) => {
  const email = uniqueEmail("mv-layout")
  await signUp(page, email)
  await addTopLevel(page, `Task ${Date.now()}`)

  // Picking a layout writes it to the URL (deep-linkable) and marks the tab selected.
  await tab(page, "Table").click()
  await expect(page).toHaveURL(/layout=table/)
  await expect(tab(page, "Table")).toHaveAttribute("aria-selected", "true")

  // Land on the bare route (no query) → the choice is restored from localStorage (decision B).
  await page.goto("/")
  await expectSignedIn(page, email)
  await expect(tab(page, "Table")).toHaveAttribute("aria-selected", "true")
})

test("Show subtasks surfaces subtasks in the list and table", async ({ page }) => {
  const email = uniqueEmail("mv-subtasks")
  const stamp = Date.now()
  const parent = `Parent ${stamp}`
  const sub = `Sub ${stamp}`

  await signUp(page, email)
  await addTopLevel(page, parent)

  // Add a subtask through the parent's modal, then close it.
  await page.getByText(parent, { exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByPlaceholder("Add a subtask…").fill(sub)
  await dialog.getByRole("button", { name: "Add subtask" }).click()
  await expect(dialog.getByText(sub, { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()

  // Default off: the list nests the subtask (it isn't its own row).
  await expect(page.getByText(sub, { exact: true })).toHaveCount(0)

  // Turn on "Show subtasks" in the settings modal.
  await page.getByRole("button", { name: "View settings" }).click()
  await page.getByRole("checkbox", { name: /show subtasks/i }).click()
  await page.keyboard.press("Escape")

  // List now expands it inline; the table surfaces it as its own row.
  await expect(page.getByText(sub, { exact: true })).toBeVisible()
  await tab(page, "Table").click()
  await expect(page.getByText(sub, { exact: true })).toBeVisible()
})

test("board shows tasks as cards under the default columns", async ({ page }) => {
  const email = uniqueEmail("mv-board")
  const title = `Board task ${Date.now()}`

  await signUp(page, email)
  await addTopLevel(page, title)

  await tab(page, "Board").click()
  // The default group seeds a To Do (open) and Done (done) column.
  await expect(page.getByText("To Do", { exact: true })).toBeVisible()
  await expect(page.getByText("Done", { exact: true })).toBeVisible()
  // A new task lands in its open status → visible as a card on the board.
  await expect(page.getByText(title, { exact: true })).toBeVisible()
})

test("mobile: the calendar unscheduled tray is a slide-out shelf", async ({ page }) => {
  const email = uniqueEmail("mv-shelf")
  // Deliberately avoid the word "Unscheduled" in the title so it can't clash with the tray handle.
  const title = `Loose task ${Date.now()}`

  await page.setViewportSize({ width: 390, height: 800 })
  await signUp(page, email)
  await addTopLevel(page, title) // no due date ⇒ lands in the Unscheduled tray

  await tab(page, "Calendar").click()

  // On a phone the tray is collapsed to an edge handle; the item sits off-screen to the right.
  const handle = page.getByRole("button", { name: /Unscheduled/ })
  await expect(handle).toBeVisible()
  const item = page.getByText(title, { exact: true })
  const closed = await item.boundingBox()
  expect(closed?.x ?? 0).toBeGreaterThanOrEqual(380)

  // Pulling the handle slides the shelf (and its item) into view.
  await handle.click()
  await expect(async () => {
    const open = await item.boundingBox()
    expect(open?.x ?? 999).toBeLessThan(380)
  }).toPass()
})
