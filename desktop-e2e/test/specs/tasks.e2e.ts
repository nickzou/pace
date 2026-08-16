import { $, browser, expect } from "@wdio/globals"
import { PASSWORD, uniqueEmail } from "../helpers"

// The desktop app is the web UI wrapped in Tauri (bearer-token auth over
// tauri://localhost). This mirrors the web/mobile tasks slice: sign up, add a
// task, and confirm it survives a reload — proving it reached Postgres via tRPC,
// not just the optimistic cache.
describe("desktop tasks", () => {
  it("add a task → it appears and survives a reload", async () => {
    const email = uniqueEmail("desktop-tasks")

    // Reach a clean signed-out start. Unlike the browser (fresh context per
    // test), this packaged app's localStorage — where the bearer token lives —
    // persists across WebDriver sessions, so a prior spec can leave us signed in.
    // Wait for the app to settle into either state, then sign out if needed.
    await browser.waitUntil(
      async () =>
        (await $('button[aria-label="Sign out"]').isExisting()) ||
        (await $("p*=to see your tasks").isExisting()),
      { timeout: 15_000, timeoutMsg: "app never rendered a signed in/out state" },
    )
    if (await $('button[aria-label="Sign out"]').isExisting()) {
      await $('button[aria-label="Sign out"]').click()
    }
    await expect($("p*=to see your tasks")).toBeDisplayed()
    await $("a=Sign in").click()
    await $("a*=Sign up").click()
    await $('input[autocomplete="name"]').setValue("Desktop Tasks")
    await $('input[autocomplete="email"]').setValue(email)
    await $('input[autocomplete="new-password"]').setValue(PASSWORD)
    await $('button[type="submit"]').click()
    await expect($(`span*=${email}`)).toBeDisplayed()

    // Add a task.
    const title = `Buy milk ${Date.now()}`
    await $('input[placeholder*="Add a task"]').setValue(title)
    await $("button=Add").click()
    await expect($(`span*=${title}`)).toBeDisplayed()

    // Reload the webview: the bearer token in localStorage survives, so the app
    // re-authenticates and re-fetches — the task is still there only if it
    // actually persisted to the database.
    await browser.refresh()
    await expect($(`span*=${email}`)).toBeDisplayed()
    await expect($(`span*=${title}`)).toBeDisplayed()
  })
})
