import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "../env"
import * as activitySchema from "./activity"
import * as authSchema from "./auth"
import * as statusSchema from "./statuses"
import * as tagSchema from "./tags"
import * as taskSchema from "./tasks"

// postgres.js connects lazily on first query, so importing this is cheap.
const client = postgres(env.DATABASE_URL)

// Every schema file (auth tables + tasks + the P2-03 status tables + P2-04 tags + the P3-08
// activity history) so Drizzle knows every table.
export const db = drizzle(client, {
  schema: { ...activitySchema, ...authSchema, ...statusSchema, ...tagSchema, ...taskSchema },
})
