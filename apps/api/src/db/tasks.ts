import {
  type AnyPgColumn,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
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
    // Subtask hierarchy (P2-05): the parent task, or NULL for a top-level task — a
    // self-reference, since a subtask is just a task with a parent. onDelete "set null"
    // is only a hard-delete safety net (promotes orphans to top-level); the everyday
    // delete is a soft, undoable, recursive cascade run in the tasks router, which also
    // caps nesting at 5 levels. AnyPgColumn breaks the self-referential type cycle.
    parentId: uuid("parent_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "set null",
    }),
    // Manual ordering (P2-06): a fractional (LexoRank-style) sort key. Tasks render
    // `ORDER BY sort_order, id` within a sibling scope (parent_id); a drag rewrites only
    // this one row's key (generateKeyBetween of its new neighbours), so a reorder is O(1)
    // and converges under offline sync — unlike the integer-position+renumber the statuses/
    // tags routers use. NOT NULL: new rows get a key at insert; existing rows are backfilled
    // (migration 0009) with spaced keys preserving today's created_at DESC order. The empty
    // default only exists so the ADD COLUMN is non-blocking; the backfill overwrites it.
    sortOrder: text("sort_order").notNull().default(""),
    // Recurrence (P2-08): a nullable RRULE (RFC 5545) body, anchored to due_date — NULL means the
    // task doesn't repeat. `recurrenceRegen` picks what completing it does: 'advance' reschedules
    // this same task to the next occurrence; 'duplicate' leaves it done and the server mints a fresh
    // task for the next occurrence. Generation is event-driven on the non-done → done transition
    // (tasks router), so there's no scheduled job; future occurrences are computed, never stored.
    recurrence: text("recurrence"),
    recurrenceRegen: text("recurrence_regen"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("tasks_user_id_idx").on(table.userId),
    // The detail view loads a task's children, and the guards/cascade walk the tree, by parent.
    index("tasks_parent_id_idx").on(table.parentId),
    // Mirrors the ordered read (P2-06): scope by owner + sibling set, ordered by the sort key.
    index("tasks_order_idx").on(table.userId, table.parentId, table.sortOrder),
  ],
)
