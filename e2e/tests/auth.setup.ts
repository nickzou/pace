import { expect, test as setup } from "@playwright/test"
import { API_URL, PASSWORD, uniqueEmail, WEB_ORIGIN } from "./helpers"

const authFile = "playwright/.auth/user.json"

// Programmatic login: create a user via the API and save the session cookie to
// a storageState file. Specs that need an authenticated user reuse it instead
// of driving the sign-in form every time (fast + stable). The one test that
// exercises the login *UI* lives in auth-flow.spec.ts.
setup("authenticate", async ({ request }) => {
  const email = uniqueEmail("setup")
  const res = await request.post(`${API_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_ORIGIN },
    data: { email, password: PASSWORD, name: "Setup User" },
  })
  expect(res.ok()).toBeTruthy()
  await request.storageState({ path: authFile })
})
