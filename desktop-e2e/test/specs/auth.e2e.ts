import { $, expect } from "@wdio/globals"
import { PASSWORD, uniqueEmail } from "../helpers"

// The desktop app is the web UI wrapped by Tauri, served from tauri://localhost
// where cookies aren't sent cross-site — so it authenticates with a bearer token
// (captured from set-auth-token, stored in localStorage). This drives that whole
// path through the real WebKitWebView, the piece Playwright can't reach.
//
// The inputs are labelled by a wrapping <span> (no id/for), so we select on the
// stable `autocomplete` attribute; navigation is client-side <Link> clicks.
describe("desktop auth", () => {
  it("sign up → signed in → sign out → sign in", async () => {
    const email = uniqueEmail("desktop")

    // Launches to the home screen, signed out — RequireLocalDb renders
    // "Sign in to see your tasks".
    await expect($("p*=to see your tasks")).toBeDisplayed()

    // Sign up. The signed-out home only links to "Sign in"; the sign-in page then
    // links to sign-up. (Sign-out is now an icon button, labelled via aria-label.)
    await $("a=Sign in").click()
    await $("a*=Sign up").click()
    await $('input[autocomplete="name"]').setValue("Desktop User")
    await $('input[autocomplete="email"]').setValue(email)
    // Sign-up has two new-password inputs (password + confirm); fill both.
    const passwordInputs = await $$('input[autocomplete="new-password"]')
    await passwordInputs[0].setValue(PASSWORD)
    await passwordInputs[1].setValue(PASSWORD)
    await $('button[type="submit"]').click()

    // Redirected home, authenticated as the new user (bearer token stored).
    await expect($(`span*=${email}`)).toBeDisplayed()
    await expect($('button[aria-label="Sign out"]')).toBeDisplayed()

    // Sign out clears the token → back to the signed-out home.
    await $('button[aria-label="Sign out"]').click()
    await expect($("p*=to see your tasks")).toBeDisplayed()

    // Sign back in with the same account — proves the token round-trip, not just
    // a lingering session.
    await $("a=Sign in").click()
    await $('input[autocomplete="email"]').setValue(email)
    await $('input[autocomplete="current-password"]').setValue(PASSWORD)
    await $('button[type="submit"]').click()

    await expect($(`span*=${email}`)).toBeDisplayed()
  })
})
