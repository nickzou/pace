import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "../env"
import * as authSchema from "./auth"
import * as statusSchema from "./statuses"
import * as taskSchema from "./tasks"

// postgres.js connects lazily on first query, so importing this is cheap.
const client = postgres(env.DATABASE_URL)

// Every schema file (auth tables + tasks + the P2-03 status tables) so Drizzle knows
// every table.
export const db = drizzle(client, {
  schema: { ...authSchema, ...statusSchema, ...taskSchema },
})
