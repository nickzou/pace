import { expect, test } from "@playwright/test"
import { expectSignedIn } from "./helpers"

// P2-05 · Subtasks. Reuses the session saved by auth.setup.ts.
test.use({ storageState: "playwright/.auth/user.json" })

// Sync-heavy (tasks + the recursive tree cold-sync in CI) — give headroom.
test.beforeEach(() => test.slow())

async function addTopLevel(page: import("@playwright/test").Page, title: string) {
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()
}

// The core PRD flow: break a task into a subtask, open the subtask (it's a full task with its
// own detail + breadcrumb), then change its parent — promote it back to top-level — and prove
// it round-trips through Postgres on reload.
test("add a subtask, drill into it, promote it to top-level, and persist across reload", async ({
  page,
}) => {
  await page.goto("/")
  await expectSignedIn(page)

  const stamp = Date.now()
  const parent = `Parent ${stamp}`
  const sub = `Sub ${stamp}`

  await addTopLevel(page, parent)

  // Open the parent, add a subtask from its detail.
  await page.getByText(parent).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByPlaceholder("Add a subtask…").fill(sub)
  await dialog.getByRole("button", { name: "Add subtask" }).click()
  await expect(dialog.getByText(sub)).toBeVisible()

  // Drill into the subtask — its title is a link to its own detail (/tasks/$id).
  await dialog.getByRole("link", { name: sub }).click()
  // We're now on the subtask's own detail: its title fills the editor and a breadcrumb points up.
  await expect(page.getByPlaceholder("Task title")).toHaveValue(sub)
  await expect(page.getByText(`↑ ${parent}`)).toBeVisible()

  // Change its parent → None (top-level). Wait for the breadcrumb to disappear — that only
  // happens once the promote commits locally — before navigating, so we don't race the async
  // write (a still-a-subtask row is hidden from the top-level list).
  await page.getByLabel("Parent task").selectOption("")
  await expect(page.getByText(`↑ ${parent}`)).toBeHidden()

  // Back on the list it's now a top-level row of its own, and survives a reload (Postgres
  // round-trip, not just optimistic cache).
  await page.goto("/")
  await expectSignedIn(page)
  await expect(page.getByText(sub)).toBeVisible()
  await page.reload()
  await expectSignedIn(page)
  await expect(page.getByText(parent)).toBeVisible()
  await expect(page.getByText(sub)).toBeVisible()
})

// Deleting a parent cascades to its whole subtree; Undo restores it all.
test("deleting a parent cascades to its subtasks, and Undo restores the subtree", async ({
  page,
}) => {
  await page.goto("/")
  await expectSignedIn(page)

  const stamp = Date.now()
  const parent = `Tree ${stamp}`
  const a = `Child A ${stamp}`
  const b = `Child B ${stamp}`

  await addTopLevel(page, parent)

  // Two subtasks under the parent.
  await page.getByText(parent).click()
  const dialog = page.getByRole("dialog")
  for (const t of [a, b]) {
    await dialog.getByPlaceholder("Add a subtask…").fill(t)
    await dialog.getByRole("button", { name: "Add subtask" }).click()
    await expect(dialog.getByText(t)).toBeVisible()
  }
  await page.keyboard.press("Escape") // close the detail

  // Delete the parent from its row → the whole subtree goes and a subtree-aware toast appears.
  const row = page.getByRole("listitem").filter({ hasText: parent })
  await row.getByRole("button", { name: "Delete task" }).click()
  await expect(page.getByText(parent)).toBeHidden()
  await expect(page.getByText("Task and 2 subtasks deleted")).toBeVisible()

  // Undo restores the parent… and its subtasks — the progress badge only shows 0/2 once both
  // children are back in the local DB, so it gates the reload on the whole subtree committing.
  await page.getByRole("button", { name: "Undo" }).click()
  const restored = page.getByRole("listitem").filter({ hasText: parent })
  await expect(restored.getByText("0/2")).toBeVisible()

  // Reopening the parent after a reload proves the subtree synced back through Postgres.
  await page.reload()
  await expectSignedIn(page)
  await page.getByText(parent).click()
  const dialog2 = page.getByRole("dialog")
  await expect(dialog2.getByText(a)).toBeVisible()
  await expect(dialog2.getByText(b)).toBeVisible()
})
