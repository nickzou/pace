import { $, browser, expect } from "@wdio/globals"
import { PASSWORD, uniqueEmail } from "../helpers"

// Round-trip proof through the server on desktop. There's only one app instance
// (no second browser context like the web suite), so we simulate a "fresh device"
// by signing out — which wipes the local database (disconnectAndClear) — and
// signing back in as the same user. If the task reappears, it can only have come
// from the server, not local persistence.
describe("desktop tasks sync", () => {
  it("a task survives a local wipe (round-trip through the server)", async () => {
    const email = uniqueEmail("desktop-sync")
    const title = `Synced ${Date.now()}`

    // Reach a clean signed-out start (localStorage persists across sessions).
    await browser.waitUntil(
      async () =>
        (await $("button=Sign out").isExisting()) || (await $("span*=not signed in").isExisting()),
      { timeout: 15_000, timeoutMsg: "app never rendered a signed in/out state" },
    )
    if (await $("button=Sign out").isExisting()) {
      await $("button=Sign out").click()
    }
    await expect($("span*=not signed in")).toBeDisplayed()

    // Sign up and add a task.
    await $("a=Sign up").click()
    await $('input[autocomplete="name"]').setValue("Desktop Sync")
    await $('input[autocomplete="email"]').setValue(email)
    await $('input[autocomplete="new-password"]').setValue(PASSWORD)
    await $('button[type="submit"]').click()
    await expect($(`span*=${email}`)).toBeDisplayed()

    await $('input[placeholder*="Add a task"]').setValue(title)
    await $("button=Add").click()
    await expect($(`span*=${title}`)).toBeDisplayed()

    // Let the local write upload to the server before we wipe local state.
    await browser.pause(3000)

    // Sign out (wipes the local DB) then sign back in as the same user.
    await $("button=Sign out").click()
    await expect($("span*=not signed in")).toBeDisplayed()
    await $("a=Sign in").click()
    await $('input[autocomplete="email"]').setValue(email)
    await $('input[autocomplete="current-password"]').setValue(PASSWORD)
    await $('button[type="submit"]').click()
    await expect($(`span*=${email}`)).toBeDisplayed()

    // The local DB was cleared on sign-out, so the task can only be here if it
    // synced back down from the server.
    await expect($(`span*=${title}`)).toBeDisplayed()
  })
})
