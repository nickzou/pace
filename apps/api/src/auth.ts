import { expo } from "@better-auth/expo"
import { PASSWORD_MIN_LENGTH } from "@pace/validation"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer, jwt } from "better-auth/plugins"
import { db } from "./db"
import * as schema from "./db/auth"
import { seedUserStatuses } from "./db/seed"
import { env } from "./env"

// The mobile app (apps/mobile) authenticates via its deep-link scheme rather
// than a browser origin; the expo() plugin handles its token-in-header flow.
const MOBILE_SCHEME = "pace://"

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [...env.TRUSTED_ORIGINS.split(","), MOBILE_SCHEME],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Password policy: length is enforced natively here; the full complexity rule (upper/lower/
  // number/symbol) lives in @pace/validation and is enforced on the sign-up route (see
  // routes/api/auth/[...all].ts) so it stays a single source of truth shared with the clients.
  emailAndPassword: { enabled: true, minPasswordLength: PASSWORD_MIN_LENGTH },
  // Seed each new user's default status library (P2-03) right after the account row is
  // created, so their To Do/Done + settings exist before they ever create a task.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await seedUserStatuses(user.id)
        },
      },
    },
  },
  // expo(): mobile token-in-header flow. bearer(): lets the packaged desktop app
  // (served from tauri://, where cross-site cookies aren't sent) authenticate
  // with an Authorization: Bearer token instead. Web stays on cookies.
  //
  // jwt(): mints a short-lived JWT (EdDSA) and serves its public keys at
  // /api/auth/jwks, so the self-hosted PowerSync service (M11) can authenticate a
  // signed-in user. `sub` is the user id — sync rules read it as auth.user_id() —
  // and `aud` matches PowerSync's client_auth.audience. Keys persist in a `jwks`
  // table (added by auth:generate).
  plugins: [
    expo(),
    bearer(),
    jwt({
      jwt: {
        audience: "powersync",
        getSubject: (session) => session.user.id,
        // PowerSync only needs the subject (user id); don't ship the user's
        // name/email in the token. Add claims here if sync rules ever need them.
        definePayload: () => ({}),
      },
    }),
  ],
})
