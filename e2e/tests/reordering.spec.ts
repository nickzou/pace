import { expect, type Locator, type Page, test } from "@playwright/test"
import { expectSignedIn, PASSWORD, uniqueEmail } from "./helpers"

// P2-06 · manual ordering (drag-and-drop). Reorder is driven through dnd-kit's KEYBOARD sensor
// here — deterministic (no pixel math / drag flakiness) and it exercises the exact same onDragEnd
// → fractional-key write path a mouse drag does. Each test signs up a FRESH user so the list holds
// only its tasks and positions are unambiguous.

// Sync-heavy (fresh signup + cold re-sync on reload + a second device) — give the reload/sync
// waits headroom over the default 30s test budget, as the other sync specs do.
test.beforeEach(() => test.slow())

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Reorder User")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()
  await expectSignedIn(page, email)
}

async function addTopLevel(page: Page, title: string): Promise<void> {
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()
}

// y-position of the row containing `title`, so we can assert relative order regardless of what
// else is on screen.
async function rowY(page: Page, title: string): Promise<number> {
  const box = await page.getByText(title, { exact: true }).boundingBox()
  if (!box) throw new Error(`no row for ${title}`)
  return box.y
}

// dnd-kit's sortable transition (drives the keyboard reorder animation) — settle past it between
// keypresses so none land mid-transition and get dropped.
const DND_SETTLE = 400

// Lift the row's grip with the keyboard, step it up `n` positions, and drop. dnd-kit's
// KeyboardSensor commits onDragEnd on the final Space — the same write path as a mouse drag. Two
// things make this robust across runner speeds (the CI flake was both): gate on focus actually
// landing before lifting, and pace each keypress past the ~250ms transition.
async function keyboardMoveUp(page: Page, handle: Locator, n: number): Promise<void> {
  await handle.focus()
  await expect(handle).toBeFocused() // don't press Space until focus is really on the grip
  await page.keyboard.press("Space") // lift into keyboard-drag mode
  await page.waitForTimeout(DND_SETTLE)
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("ArrowUp") // move up one position
    await page.waitForTimeout(DND_SETTLE)
  }
  await page.keyboard.press("Space") // drop → commits the fractional-key write
  await page.waitForTimeout(200)
}

test("drag-reorder persists across reload and syncs to a second device", async ({ browser }) => {
  const email = uniqueEmail("reorder")
  const stamp = Date.now()
  const [a, b, c] = [`A ${stamp}`, `B ${stamp}`, `C ${stamp}`]

  const deviceA = await browser.newContext()
  const pageA = await deviceA.newPage()
  await signUp(pageA, email)

  // New tasks append to the bottom → visible order A, B, C (top→bottom).
  await addTopLevel(pageA, a)
  await addTopLevel(pageA, b)
  await addTopLevel(pageA, c)
  expect(await rowY(pageA, a)).toBeLessThan(await rowY(pageA, b))
  expect(await rowY(pageA, b)).toBeLessThan(await rowY(pageA, c))

  // Move C to the top (up two positions) → C, A, B.
  const gripC = pageA
    .getByRole("listitem")
    .filter({ hasText: c })
    .getByRole("button", { name: "Drag to reorder" })
  await keyboardMoveUp(pageA, gripC, 2)

  // Gate on the reactive UI reflecting the new order (the write committed locally) before reload.
  await expect(async () => {
    expect(await rowY(pageA, c)).toBeLessThan(await rowY(pageA, a))
  }).toPass()
  expect(await rowY(pageA, a)).toBeLessThan(await rowY(pageA, b))

  // Reload: the reorder round-tripped to Postgres, not just optimistic local state.
  await pageA.reload()
  await expectSignedIn(pageA, email)
  await expect(pageA.getByText(c, { exact: true })).toBeVisible()
  expect(await rowY(pageA, c)).toBeLessThan(await rowY(pageA, a))
  expect(await rowY(pageA, a)).toBeLessThan(await rowY(pageA, b))

  // A second device (fresh local DB, same login) sees the same order — it can only have the
  // order by syncing sort_order down from the server.
  const deviceB = await browser.newContext({ storageState: await deviceA.storageState() })
  const pageB = await deviceB.newPage()
  await pageB.goto("/")
  await expectSignedIn(pageB, email)
  await expect(pageB.getByText(c, { exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(async () => {
    expect(await rowY(pageB, c)).toBeLessThan(await rowY(pageB, a))
  }).toPass({ timeout: 20_000 })
  expect(await rowY(pageB, a)).toBeLessThan(await rowY(pageB, b))

  await deviceA.close()
  await deviceB.close()
})

test("reorder a parent's subtasks", async ({ page }) => {
  const email = uniqueEmail("reorder-sub")
  const stamp = Date.now()
  const parent = `Parent ${stamp}`
  const [s1, s2, s3] = [`S1 ${stamp}`, `S2 ${stamp}`, `S3 ${stamp}`]

  await signUp(page, email)
  await addTopLevel(page, parent)

  // Open the parent and add three subtasks (append order S1, S2, S3).
  await page.getByText(parent, { exact: true }).click()
  const dialog = page.getByRole("dialog")
  for (const s of [s1, s2, s3]) {
    await dialog.getByPlaceholder("Add a subtask…").fill(s)
    await dialog.getByRole("button", { name: "Add subtask" }).click()
    await expect(dialog.getByText(s, { exact: true })).toBeVisible()
  }

  // Move S3 to the top of the subtask list (up two).
  const gripS3 = dialog
    .getByRole("listitem")
    .filter({ hasText: s3 })
    .getByRole("button", { name: "Drag to reorder" })
  await keyboardMoveUp(page, gripS3, 2)

  const y = async (t: string) => {
    const box = await dialog.getByText(t, { exact: true }).boundingBox()
    if (!box) throw new Error(`no subtask row ${t}`)
    return box.y
  }
  await expect(async () => {
    expect(await y(s3)).toBeLessThan(await y(s1))
  }).toPass()
  expect(await y(s1)).toBeLessThan(await y(s2))

  // Reload proves the subtask reorder persisted through Postgres.
  await page.reload()
  await expectSignedIn(page, email)
  await page.getByText(parent, { exact: true }).click()
  const dialog2 = page.getByRole("dialog")
  await expect(dialog2.getByText(s3, { exact: true })).toBeVisible()
  const y2 = async (t: string) => {
    const box = await dialog2.getByText(t, { exact: true }).boundingBox()
    if (!box) throw new Error(`no subtask row ${t}`)
    return box.y
  }
  expect(await y2(s3)).toBeLessThan(await y2(s1))
})

test("a filtered/searched view is not draggable (no grip)", async ({ page }) => {
  const email = uniqueEmail("reorder-filter")
  const title = `Filterable ${Date.now()}`

  await signUp(page, email)
  await addTopLevel(page, title)

  // Unfiltered: the row has a drag grip.
  const grip = page.getByRole("button", { name: "Drag to reorder" })
  await expect(grip.first()).toBeVisible()

  // Typing a search flattens the list to a filtered subset → drag is disabled, no grips.
  await page.getByPlaceholder("Search…").fill(title)
  await expect(page.getByText(title, { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Drag to reorder" })).toHaveCount(0)
})
