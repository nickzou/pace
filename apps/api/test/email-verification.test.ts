import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it, vi } from "vitest"

// Turn the gate on for THIS file only. Vitest isolates module registries per test
// file, so env.ts (read once at import) evaluates with the flag set here without
// affecting the other suites. Must run before the imports below — vi.hoisted does.
vi.hoisted(() => {
  process.env.REQUIRE_EMAIL_VERIFICATION = "true"
})

// Capture verification emails at the mailer boundary instead of talking to SMTP,
// so we can read the link's token back in-process (no Mailpit needed for this test).
const { sentEmails } = vi.hoisted(() => ({
  sentEmails: [] as { to: string; subject: string; text: string; html: string }[],
}))
vi.mock("../src/email/mailer", () => ({
  sendEmail: vi.fn(async (msg: (typeof sentEmails)[number]) => {
    sentEmails.push(msg)
  }),
}))

import { auth } from "../src/auth"
import { db } from "../src/db"
import { user } from "../src/db/auth"

const PASSWORD = "Supersecret123!"
const freshEmail = () => `verify-${randomUUID()}@pace.test`

// The email is sent via Better Auth's run-in-background, so it may land just after
// signUpEmail resolves — poll briefly rather than assume it's synchronous.
async function waitForEmailTo(to: string) {
  for (let i = 0; i < 40; i++) {
    const mail = sentEmails.find((e) => e.to === to)
    if (mail) return mail
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`no verification email captured for ${to}`)
}

function tokenFromLink(text: string): string {
  const token = text.match(/[?&]token=([^&\s]+)/)?.[1]
  if (!token) throw new Error("no token found in verification email")
  return decodeURIComponent(token)
}

afterEach(() => {
  sentEmails.length = 0
})

describe("email verification gate", () => {
  it("sign-up creates no session and sends a verification email", async () => {
    const email = freshEmail()
    const res = (await auth.api.signUpEmail({
      body: { name: "Verify Me", email, password: PASSWORD },
    })) as { token: string | null }

    // The account exists but the user is NOT signed in — no session token.
    expect(res.token).toBeNull()
    const mail = await waitForEmailTo(email)
    expect(mail.subject).toMatch(/verify/i)
  })

  it("blocks sign-in until verified, then allows it after the link is clicked", async () => {
    const email = freshEmail()
    await auth.api.signUpEmail({ body: { name: "Verify Me", email, password: PASSWORD } })

    // Unverified sign-in is refused.
    await expect(auth.api.signInEmail({ body: { email, password: PASSWORD } })).rejects.toThrow()

    // "Click" the emailed link.
    const mail = await waitForEmailTo(email)
    await auth.api.verifyEmail({ query: { token: tokenFromLink(mail.text) } })

    const [row] = await db.select().from(user).where(eq(user.email, email))
    expect(row?.emailVerified).toBe(true)

    // Now sign-in succeeds and returns a session.
    const res = (await auth.api.signInEmail({
      body: { email, password: PASSWORD },
    })) as { token: string | null }
    expect(res.token).toBeTruthy()
  })

  it("resends the verification email on request", async () => {
    const email = freshEmail()
    await auth.api.signUpEmail({ body: { name: "Verify Me", email, password: PASSWORD } })
    await waitForEmailTo(email)
    sentEmails.length = 0

    await auth.api.sendVerificationEmail({ body: { email, callbackURL: "/verified" } })
    const mail = await waitForEmailTo(email)
    expect(mail.subject).toMatch(/verify/i)
  })
})
