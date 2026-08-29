import { $, $$, browser, expect } from "@wdio/globals"
import { PASSWORD, uniqueEmail } from "../helpers"

// Regression guard for the sign-out bug. On desktop, sign-out must both return to
// the signed-out home AND clear the stored bearer token — otherwise a reload would
// silently re-authenticate from the lingering token.
describe("desktop sign out", () => {
  it("sign out → confirmed signed out, and stays out on reload", async () => {
    const email = uniqueEmail("desktop-signout")

    // Reach a clean signed-out start. This packaged app's localStorage (where the
    // bearer token lives) persists across WebDriver sessions, so a prior spec can
    // leave us signed in — settle into either state, then sign out if needed.
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

    // Sign up a fresh user so we're authenticated (bearer token stored). The
    // signed-out home only links to "Sign in"; the sign-in page links to sign-up.
    await $("a=Sign in").click()
    await $("a*=Sign up").click()
    await $('input[autocomplete="name"]').setValue("Desktop SignOut")
    await $('input[autocomplete="email"]').setValue(email)
    // Sign-up has two new-password inputs (password + confirm); fill both.
    for (const input of await $$('input[autocomplete="new-password"]')) {
      await input.setValue(PASSWORD)
    }
    await $('button[type="submit"]').click()
    await expect($(`span*=${email}`)).toBeDisplayed()

    // Sign out → back to the signed-out home, signed-in affordances gone.
    await $('button[aria-label="Sign out"]').click()
    await expect($("p*=to see your tasks")).toBeDisplayed()
    await expect($('button[aria-label="Sign out"]')).not.toBeDisplayed()

    // Reload the webview: the bearer token was cleared, so we don't re-auth.
    await browser.refresh()
    await expect($("p*=to see your tasks")).toBeDisplayed()
  })
})
