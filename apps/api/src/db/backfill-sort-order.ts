// P2-06 backfill: give every pre-existing task a fractional sort key.
//
// Migration 0009 adds `tasks.sort_order text NOT NULL DEFAULT ''` — a non-blocking
// ADD COLUMN, but '' sorts first and ties on every row, so without this step the
// list would fall back to id order (arbitrary). Here we mint proper spaced keys per
// sibling scope, preserving today's visible order (created_at DESC).
//
// Runs as part of `db:migrate` (right after drizzle-kit applies the SQL), so it fires
// on every environment migrations do — prod included, where the seed step never runs.
// IDEMPOTENT: it only touches rows still holding the '' default, so re-runs on later
// deploys find nothing and are a no-op.
//
// Connects via DATABASE_URL alone (like drizzle.config.ts) — NOT src/env, which also
// requires the auth vars the one-off migrate container isn't given.
import { resolve } from "node:path"
import { config } from "dotenv"
import postgres from "postgres"
import { type BackfillRow, planBackfill } from "./sort-order"

// Local: load the repo-root .env. In a container DATABASE_URL is already set, so this
// is a harmless no-op (dotenv never overrides an existing process-env value).
config({ path: resolve(process.cwd(), "../../.env") })

const url = process.env.DATABASE_URL
if (!url) throw new Error("Missing required env var: DATABASE_URL")

const sql = postgres(url)

async function backfill(): Promise<void> {
  // Only un-keyed rows. Tombstones are skipped — a soft-deleted task carries no visible
  // order, and an Undo re-create restamps it from the client's captured columns anyway.
  // Order defines the key assignment: created_at DESC (newest first) so the smallest key
  // goes to the newest task, and `ORDER BY sort_order` reproduces today's newest-first list.
  // id breaks created_at ties deterministically.
  const rows = await sql<BackfillRow[]>`
    SELECT id, user_id AS "userId", parent_id AS "parentId"
    FROM tasks
    WHERE sort_order = '' AND deleted_at IS NULL
    ORDER BY user_id, parent_id NULLS FIRST, created_at DESC, id ASC
  `
  if (rows.length === 0) {
    console.log("[backfill-sort-order] no un-keyed tasks — nothing to do")
    return
  }

  const plan = planBackfill(rows)
  await sql.begin(async (tx) => {
    for (const { id, sortOrder } of plan) {
      await tx`UPDATE tasks SET sort_order = ${sortOrder} WHERE id = ${id}`
    }
  })
  console.log(`[backfill-sort-order] keyed ${plan.length} task(s)`)
}

// postgres.js keeps the event loop alive; exit explicitly once done.
backfill()
  .then(() => sql.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill-sort-order] failed:", err)
    process.exit(1)
  })
