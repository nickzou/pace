import { expect, type Page, test } from "@playwright/test"
import { expectSignedIn } from "./helpers"

// P2-03 polish: editing an existing status (recolour / rename), renaming a group, and
// moving a task to another status list. Each of these had the API + connector wired from
// the start but no UI control, so the point of these tests is the whole round-trip — the
// reload after every edit is what proves the write reached Postgres, not just optimistic
// local state (which is exactly the "control renders but does nothing" class of bug that
// let these gaps ship). Reuses the session saved by auth.setup.ts.
test.use({ storageState: "playwright/.auth/user.json" })

// The management UI is gated behind the enable toggle; turn it on (idempotent).
async function enableCustomStatuses(page: Page): Promise<void> {
  await page.goto("/settings")
  const toggle = page.getByRole("switch", { name: "Enable custom statuses" })
  // The toggle is disabled until user_settings syncs down. Acting on the pre-sync
  // default races the sync (it can flip back), so wait for the real state to load first.
  await expect(toggle).toBeEnabled()
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  // Gate on the management UI actually rendering (its "new list" input only exists when
  // enabled) so callers don't race the re-render.
  await expect(page.getByPlaceholder("New status list…")).toBeVisible()
}

test("recolour and rename an existing status → both persist across a reload", async ({ page }) => {
  const stamp = Date.now()
  const name = `Temp ${stamp}`
  const renamed = `Renamed ${stamp}`

  await enableCustomStatuses(page)

  // A throwaway status to edit, so we don't mutate the seeded To Do/Done.
  await page.getByPlaceholder("New status…").fill(name)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  const nameInput = page.getByLabel(`Rename ${name}`)
  await expect(nameInput).toBeVisible()

  // Recolour → blue. Scope the swatch to this status's row: the always-on "add status"
  // picker below also renders a full swatch set.
  await page.getByRole("button", { name: `Change ${name} colour` }).click()
  const row = page.getByRole("listitem").filter({ has: nameInput })
  await row.getByRole("button", { name: "blue", exact: true }).click()

  // Rename (saves on blur; Enter blurs).
  await nameInput.fill(renamed)
  await nameInput.press("Enter")
  await expect(page.getByLabel(`Rename ${renamed}`)).toBeVisible()

  // Reload: the rename reached Postgres…
  await page.reload()
  const renamedInput = page.getByLabel(`Rename ${renamed}`)
  await expect(renamedInput).toHaveValue(renamed)

  // …and so did the recolour. Reopen the picker and assert blue is the selected swatch
  // (its ring) — theme-independent, unlike asserting a resolved hex on the dot.
  await page.getByRole("button", { name: `Change ${renamed} colour` }).click()
  const rowAfter = page.getByRole("listitem").filter({ has: renamedInput })
  await expect(rowAfter.getByRole("button", { name: "blue", exact: true })).toHaveClass(/ring-2/)
})

test("rename a status group → persists across a reload", async ({ page }) => {
  const stamp = Date.now()
  const name = `List ${stamp}`
  const renamed = `Renamed List ${stamp}`

  await enableCustomStatuses(page)

  await page.getByPlaceholder("New status list…").fill(name)
  await page.getByRole("button", { name: "Add list" }).click()

  const groupInput = page.getByLabel(`Rename ${name} list`)
  await expect(groupInput).toBeVisible()
  await groupInput.fill(renamed)
  await groupInput.press("Enter")
  await expect(page.getByLabel(`Rename ${renamed} list`)).toBeVisible()

  await page.reload()
  await expect(page.getByLabel(`Rename ${renamed} list`)).toHaveValue(renamed)
})

test("move a task to another status list → its status changes and persists", async ({ page }) => {
  const stamp = Date.now()
  const listName = `Work ${stamp}`
  const openStatus = `Doing ${stamp}`
  const title = `Move me ${stamp}`

  await enableCustomStatuses(page)

  // A second group needs its own open status — a fresh group has none, so there'd be
  // nowhere for the task to land.
  await page.getByPlaceholder("New status list…").fill(listName)
  await page.getByRole("button", { name: "Add list" }).click()
  const workHeader = page.getByLabel(`Rename ${listName} list`)
  await expect(workHeader).toBeVisible()
  const workBlock = page.locator("div.rounded-lg").filter({ has: workHeader })
  await workBlock.getByPlaceholder("New status…").fill(openStatus)
  await workBlock.getByRole("button", { name: "Add", exact: true }).click()
  await expect(workBlock.getByLabel(`Rename ${openStatus}`)).toBeVisible()

  // A task starts in the default group on To Do.
  await page.goto("/")
  await expectSignedIn(page)
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  const row = page.getByRole("listitem").filter({ hasText: title })
  await expect(row.getByRole("button", { name: "To Do" })).toBeVisible()

  // Open the detail and move it to the Work list. The status resets to that list's open
  // status (openStatusForGroup) — the whole reason a non-default group is now reachable.
  await page.getByText(title).click()
  await page.getByLabel("Status list").selectOption({ label: listName })

  // Reload proves the switch round-tripped: the list row now shows the Work open status,
  // not To Do.
  await page.reload()
  await expectSignedIn(page)
  const rowAfter = page.getByRole("listitem").filter({ hasText: title })
  await expect(rowAfter.getByRole("button", { name: openStatus })).toBeVisible()
  await expect(rowAfter.getByRole("button", { name: "To Do" })).toBeHidden()
})
