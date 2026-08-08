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

    // Launches to the home screen, signed out. (`span*=` scopes the partial-text
    // match to the span — bare `*=` maps to "partial link text", anchors only.)
    await expect($("span*=not signed in")).toBeDisplayed()

    // Sign up.
    await $("a=Sign up").click()
    await $('input[autocomplete="name"]').setValue("Desktop User")
    await $('input[autocomplete="email"]').setValue(email)
    await $('input[autocomplete="new-password"]').setValue(PASSWORD)
    await $('button[type="submit"]').click()

    // Redirected home, authenticated as the new user (bearer token stored).
    await expect($(`span*=${email}`)).toBeDisplayed()
    await expect($("button=Sign out")).toBeDisplayed()

    // Sign out clears the token → back to the signed-out home.
    await $("button=Sign out").click()
    await expect($("span*=not signed in")).toBeDisplayed()

    // Sign back in with the same account — proves the token round-trip, not just
    // a lingering session.
    await $("a=Sign in").click()
    await $('input[autocomplete="email"]').setValue(email)
    await $('input[autocomplete="current-password"]').setValue(PASSWORD)
    await $('button[type="submit"]').click()

    await expect($(`span*=${email}`)).toBeDisplayed()
  })
})
