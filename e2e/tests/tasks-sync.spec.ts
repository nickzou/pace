import { expect, test } from "@playwright/test"
import { expectSignedIn, PASSWORD, uniqueEmail } from "./helpers"

// The real round-trip proof: a task added on one "device" (browser context)
// appears on a SECOND, fresh context signed in as the same user. Context B starts
// with an empty local database (contexts don't share IndexedDB), so the task can
// only be there if it went up to the server (Postgres) and back down — not from
// local persistence. This is the honest version of the single-client reload test.
test("a task syncs to a second device (round-trip through the server)", async ({ browser }) => {
  const email = uniqueEmail("sync")
  const title = `Synced task ${Date.now()}`

  // Device A: its own isolated context. Sign up, then add a task.
  const deviceA = await browser.newContext()
  const pageA = await deviceA.newPage()
  await pageA.goto("/sign-up")
  await pageA.getByLabel("Name").fill("Sync User")
  await pageA.getByLabel("Email").fill(email)
  await pageA.getByLabel("Password").fill(PASSWORD)
  await pageA.getByRole("button", { name: "Sign up" }).click()
  await expectSignedIn(pageA, email)

  await pageA.getByPlaceholder("Add a task…").fill(title)
  await pageA.getByRole("button", { name: "Add" }).click()
  await expect(pageA.getByText(title)).toBeVisible()

  // Carry ONLY the login (cookies) to a brand-new Device B — its local database
  // stays empty.
  const deviceB = await browser.newContext({ storageState: await deviceA.storageState() })
  const pageB = await deviceB.newPage()
  await pageB.goto("/")
  await expectSignedIn(pageB, email)

  // B never wrote this task, so it can only appear by syncing down from the
  // server. Generous timeout — sync is asynchronous (upload from A, download to B).
  await expect(pageB.getByText(title)).toBeVisible({ timeout: 20_000 })

  await deviceA.close()
  await deviceB.close()
})
