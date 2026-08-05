import { expect, test } from "@playwright/test"
import { API_URL, PASSWORD, uniqueEmail, WEB_ORIGIN } from "./helpers"

async function register(request: import("@playwright/test").APIRequestContext, email: string) {
  const res = await request.post(`${API_URL}/api/auth/sign-up/email`, {
    headers: { Origin: WEB_ORIGIN },
    data: { email, password: PASSWORD, name: "Existing" },
  })
  expect(res.ok()).toBeTruthy()
}

test("wrong password is rejected and leaves you signed out", async ({ page, request }) => {
  const email = uniqueEmail("neg-wrong")
  await register(request, email)

  await page.goto("/sign-in")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("not-the-password")
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page.getByRole("alert")).toBeVisible()
  await expect(page.getByText(email)).toBeHidden()
})

test("signing up with an existing email is rejected", async ({ page, request }) => {
  const email = uniqueEmail("neg-dup")
  await register(request, email)

  await page.goto("/sign-up")
  await page.getByLabel("Name").fill("Duplicate")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(PASSWORD)
  await page.getByRole("button", { name: "Sign up" }).click()

  await expect(page.getByRole("alert")).toBeVisible()
})
