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
  // The packaged app's localStorage (bearer token) persists across WebDriver
  // sessions, so a prior spec can leave us signed in — settle, then sign out.
  await browser.waitUntil(
    async () =>
      (await $("button=Sign out").isExisting()) || (await $("span*=not signed in").isExisting()),
    { timeout: 15_000, timeoutMsg: "app never rendered a signed in/out state" },
  )
  if (await $("button=Sign out").isExisting()) await $("button=Sign out").click()
  await expect($("span*=not signed in")).toBeDisplayed()
  await $("a=Sign up").click()
  await $('input[autocomplete="name"]').setValue(name)
  await $('input[autocomplete="email"]').setValue(email)
  await $('input[autocomplete="new-password"]').setValue(PASSWORD)
  await $('button[type="submit"]').click()
  await expect($(`span*=${email}`)).toBeDisplayed()
}

async function addTask(title: string) {
  await $('input[placeholder*="Add a task"]').setValue(title)
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
    expect(await $(DUE_TIME).getValue()).toBe("")
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
    expect(await $(DUE_TIME).getValue()).toBe("23:59")
  })
})
