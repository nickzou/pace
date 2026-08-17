import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { statuses } from "./statuses"

// The tasks table — the persistence mirror of @pace/validation's taskSchema
// (M07), plus the DB-only `userId` owner (a row belongs to exactly one user).
//
// Kept in its own file, NOT in auth.ts, because `pnpm auth:generate` regenerates
// auth.ts from the Better Auth config and would clobber anything hand-added there.
//
// Timestamps are real `timestamptz` (Drizzle Date mode); the API converts them
// to ISO strings at the edge to match the wire contract. `deletedAt` is a
// nullable tombstone — set on soft delete, filtered out of reads.
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    // DEPRECATED (P2-03): kept only for the expand migration — done-ness now derives
    // from status_id's category. Dropped in the follow-up contract migration once
    // clients are on schema v2.
    completed: boolean("completed").notNull().default(false),
    // The task's current status (P2-03). NOT NULL after backfill: every task has a
    // status (the migration seeds a default group per user and backfills existing rows).
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id),
    // Set when the task enters a `done` status, cleared when it leaves. Server-owned.
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // Optional scheduling (P2-02): nullable timestamptz, stored UTC, rendered in
    // the viewer's local zone. start ≤ due is a UI convention, not a DB constraint.
    // *_has_time marks whether the user picked a real time of day (vs a date-only
    // entry, which stores a fallback time) — so an explicit 00:00/23:59 isn't
    // mistaken for "no time". A date is always a full timestamp; this is the bit
    // that says whether to show/keep the time.
    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    startHasTime: boolean("start_has_time").notNull().default(false),
    dueHasTime: boolean("due_has_time").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("tasks_user_id_idx").on(table.userId)],
)
