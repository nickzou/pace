import { $, browser, expect } from "@wdio/globals"
import { PASSWORD, uniqueEmail } from "../helpers"

// Scheduling on desktop — the web date/time pickers running inside Tauri's WebKit
// webview, syncing over PowerSync's IndexedDB VFS (web uses OPFS). Mirrors the
// Playwright date specs: a date-only entry flags Overdue and round-trips a reload,
// and an explicit 11:59 PM stays distinct from the date-only default.

const DUE_DATE = 'input[aria-label="Due date"]'
const DUE_TIME = 'input[aria-label="Due time"]'

// Set a controlled <input> the React way: the native value setter bypasses React's
// value tracker, then input+change fire its onChange. Typing into a WebKit date/time
// input directly is locale-fussy, so we set the value (as Playwright's fill does).
async function setControlledInput(selector: string, value: string) {
  await browser.execute(
    (sel, val) => {
      const el = document.querySelector(sel) as HTMLInputElement | null
      if (!el) throw new Error(`no element for ${sel}`)
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set
      setter?.call(el, val)
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.dispatchEvent(new Event("change", { bubbles: true }))
    },
    selector,
    value,
  )
}

async function valueEquals(selector: string, expected: string, timeout = 10_000) {
  await browser.waitUntil(async () => (await $(selector).getValue()) === expected, {
    timeout,
    timeoutMsg: `${selector} never became "${expected}"`,
  })
}

async function signUpFresh(name: string, email: string) {
  // Reset SPA state WITHOUT a page reload. browser.refresh() on a hot PowerSync webview
  // (wa-sqlite + web workers over WebKitGTK's slow IndexedDB VFS) intermittently CRASHES
  // it once the local DB holds a prior test's data — "session deleted because of page
  // crash or hang". Instead: Escape closes any open detail dialog (its overlay would
  // swallow the sign-out click), then sign out — which calls clearDb()/
  // disconnectAndClear(), leaving the next test a fresh, empty local DB, so that test's
  // own mid-test reload stays low-state and reliable.
  await browser.keys("Escape")
  await $('[role="dialog"]').waitForExist({ reverse: true, timeout: 10_000 })
  await browser.waitUntil(
    async () =>
      (await $('button[aria-label="Sign out"]').isExisting()) ||
      (await $("p*=to see your tasks").isExisting()),
    { timeout: 30_000, timeoutMsg: "app never rendered a signed in/out state" },
  )
  if (await $('button[aria-label="Sign out"]').isExisting())
    await $('button[aria-label="Sign out"]').click()
  await expect($("p*=to see your tasks")).toBeDisplayed()
  await $("a=Sign in").click()
  await $("a*=Sign up").click()
  await $('input[autocomplete="name"]').setValue(name)
  await $('input[autocomplete="email"]').setValue(email)
  await $('input[autocomplete="new-password"]').setValue(PASSWORD)
  await $('button[type="submit"]').click()
  await expect($(`span*=${email}`)).toBeDisplayed()
}

async function addTask(title: string) {
  await $('input[placeholder*="Add a task"]').setValue(title)
  // The Add button is disabled until the seeded default status syncs down (P2-03) —
  // a fresh signup's first PowerSync download in the desktop webview can take longer
  // than the default action wait, so wait for the composer to be ready.
  await $("button=Add").waitForEnabled({ timeout: 30_000 })
  await $("button=Add").click()
  await expect($(`span*=${title}`)).toBeDisplayed()
}

describe("desktop scheduling", () => {
  it("a past due DATE only saves, flags Overdue, and round-trips a reload", async () => {
    const email = uniqueEmail("desktop-dates")
    await signUpFresh("Desktop Dates", email)
    const title = `Schedule me ${Date.now()}`
    await addTask(title)

    // Open the detail and set only the date — no time.
    await $(`span*=${title}`).click()
    await $(DUE_DATE).waitForDisplayed()
    await setControlledInput(DUE_DATE, "2020-01-01")
    await valueEquals(DUE_DATE, "2020-01-01", 5_000)
    await expect($("span*=Overdue")).toBeDisplayed()

    // Reload the webview: the date survives only if it reached Postgres and synced.
    await browser.refresh()
    await expect($(`span*=${email}`)).toBeDisplayed()
    await $(`span*=${title}`).click()
    await valueEquals(DUE_DATE, "2020-01-01")
    // Date-only stays date-only: the end-of-day default renders as a blank time.
    await valueEquals(DUE_TIME, "")
  })

  it("an explicit 11:59 PM time is kept, not swallowed as the date-only default", async () => {
    const email = uniqueEmail("desktop-dates-time")
    await signUpFresh("Desktop Dates Time", email)
    const title = `Time me ${Date.now()}`
    await addTask(title)

    await $(`span*=${title}`).click()
    await $(DUE_DATE).waitForDisplayed()
    await setControlledInput(DUE_DATE, "2030-06-15")
    await valueEquals(DUE_DATE, "2030-06-15", 5_000)
    await setControlledInput(DUE_TIME, "23:59")
    await valueEquals(DUE_TIME, "23:59", 5_000)

    await browser.refresh()
    await expect($(`span*=${email}`)).toBeDisplayed()
    await $(`span*=${title}`).click()
    await valueEquals(DUE_DATE, "2030-06-15")
    await valueEquals(DUE_TIME, "23:59")
  })
})
