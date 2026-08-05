import { expo } from "@better-auth/expo"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db"
import * as schema from "./db/schema"
import { env } from "./env"

// The mobile app (apps/mobile) authenticates via its deep-link scheme rather
// than a browser origin; the expo() plugin handles its token-in-header flow.
const MOBILE_SCHEME = "pace://"

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [...env.TRUSTED_ORIGINS.split(","), MOBILE_SCHEME],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  plugins: [expo()],
})
