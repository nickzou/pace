import { auth } from "../auth"
import { db } from "../db"
import { env } from "../env"

// Per-request tRPC context. The session comes from Better Auth, which reads the
// cookie (web) or the `Authorization: Bearer` token (desktop/mobile) off the
// request headers — so a request is "signed in" iff getSession returns a user.
export async function createContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({ headers: req.headers })
  const user = session?.user
  // Defense-in-depth for the email-verification gate: an unverified account is
  // treated as unauthenticated, so protectedProcedure serves it no data or writes.
  // With requireEmailVerification on, such a user normally never even holds a
  // session (sign-up returns none, sign-in is blocked — see auth.ts); this closes
  // the window in case one ever does.
  const verified = !env.REQUIRE_EMAIL_VERIFICATION || (user?.emailVerified ?? false)
  return {
    db,
    userId: verified ? (user?.id ?? null) : null,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
