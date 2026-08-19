import { expect, test } from "@playwright/test"
import { expectSignedIn } from "./helpers"

// P2-04 · Tags & filtering. Reuses the session saved by auth.setup.ts.
test.use({ storageState: "playwright/.auth/user.json" })

// Sync-heavy (tasks + tags + the join cold-sync in CI) — give headroom.
test.beforeEach(() => test.slow())

// Add a task from the list composer and wait for it to land.
async function addTask(page: import("@playwright/test").Page, title: string) {
  await page.getByPlaceholder("Add a task…").fill(title)
  await page.getByRole("button", { name: "Add" }).click()
  await expect(page.getByText(title)).toBeVisible()
}

// The end-to-end flow the feature exists for: create a tag and assign it to a task in one
// gesture (the list-row picker's create-and-assign), then narrow the list by that tag and
// prove both the assignment and the URL filter survive a reload — i.e. the link reached
// Postgres and re-synced, not just the optimistic local cache.
test("create + assign a tag from the list, then filter by it → persists across reload", async ({
  page,
}) => {
  await page.goto("/")
  await expectSignedIn(page)

  const stamp = Date.now()
  // Distinct prefixes — hasText matches substrings, so "Untagged" would also match "Tagged".
  const withTag = `Tagged ${stamp}`
  const without = `Plain ${stamp}`
  const tagName = `e2e-${stamp}`

  await addTask(page, withTag)
  await addTask(page, without)

  // Open the tagged row's picker and create-and-assign a brand-new tag. The picker content
  // is portaled to the page root (Radix), so the input/button are page-level once open.
  const taggedRow = page.getByRole("listitem").filter({ hasText: withTag })
  await taggedRow.getByRole("button", { name: "Edit tags" }).click()
  await page.getByPlaceholder("New tag…").fill(tagName)
  await page.getByRole("button", { name: "Create tag" }).click()
  await page.keyboard.press("Escape") // close the picker

  // The chip lands on the tagged row (each chip is an "Edit <name>" button).
  await expect(taggedRow.getByRole("button", { name: `Edit ${tagName}` })).toBeVisible()

  // Filter the list by that tag via the filter bar's Tags facet.
  await page.getByRole("button", { name: "Tags", exact: true }).click()
  await page.getByRole("menuitem", { name: tagName }).click()
  await page.keyboard.press("Escape")

  // The URL carries the filter (deep-linkable), the tagged task stays, the other is gone.
  await expect(page).toHaveURL(/tags=/)
  await expect(page.getByText(withTag)).toBeVisible()
  await expect(page.getByText(without)).toBeHidden()

  // Reload from scratch: proves the link persisted to Postgres (re-synced into a fresh
  // local DB) AND the filter state round-trips through the URL, not just memory.
  await page.reload()
  await expectSignedIn(page)
  await expect(page.getByText(withTag)).toBeVisible()
  await expect(page.getByText(without)).toBeHidden()
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: withTag })
      .getByRole("button", {
        name: `Edit ${tagName}`,
      }),
  ).toBeVisible()
})

// The exclude (none-of) facet is the inverse: a tagged task is hidden, an untagged one stays.
test("exclude by tag → the tagged task is filtered out", async ({ page }) => {
  await page.goto("/")
  await expectSignedIn(page)

  const stamp = Date.now()
  const withTag = `Excl tagged ${stamp}`
  const without = `Excl plain ${stamp}`
  const tagName = `excl-${stamp}`

  await addTask(page, withTag)
  await addTask(page, without)

  const taggedRow = page.getByRole("listitem").filter({ hasText: withTag })
  await taggedRow.getByRole("button", { name: "Edit tags" }).click()
  await page.getByPlaceholder("New tag…").fill(tagName)
  await page.getByRole("button", { name: "Create tag" }).click()
  await page.keyboard.press("Escape")
  await expect(taggedRow.getByRole("button", { name: `Edit ${tagName}` })).toBeVisible()

  // Exclude that tag → the tagged task drops out, the untagged one remains.
  await page.getByRole("button", { name: "Exclude", exact: true }).click()
  await page.getByRole("menuitem", { name: tagName }).click()
  await page.keyboard.press("Escape")

  await expect(page.getByText(without)).toBeVisible()
  await expect(page.getByText(withTag)).toBeHidden()
})
