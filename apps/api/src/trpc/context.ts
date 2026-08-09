import { auth } from "../auth"
import { db } from "../db"

// Per-request tRPC context. The session comes from Better Auth, which reads the
// cookie (web) or the `Authorization: Bearer` token (desktop/mobile) off the
// request headers — so a request is "signed in" iff getSession returns a user.
export async function createContext({ req }: { req: Request }) {
  const session = await auth.api.getSession({ headers: req.headers })
  return {
    db,
    userId: session?.user.id ?? null,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
