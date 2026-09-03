import type { ActivityMeta } from "@pace/validation"
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { tasks } from "./tasks"

// Task activity history (P3-08) — the persistence mirror of @pace/validation's activity
// schemas. A user-scoped, APPEND-ONLY audit trail: one immutable row per meaningful change
// to a task. Conventions mirror `tasks` (client-mintable uuid, user FK cascade, timestamptz)
// with two deliberate omissions — there is NO `updated_at` and NO `deleted_at`. Rows are never
// edited or soft-deleted; a task being deleted/restored is itself just another activity row.
//
// Authored on the client (same local-first path as every task write) so the feed reflects
// offline edits instantly and no event is lost to CRUD coalescing. `recorded_at` is the one
// server-owned field — stamped on upload as the tamper-evident audit/ordering anchor.

// The kinds of change we record. Split start/due keeps the reschedule metric (count of
// `due_changed`) clean; `status_changed` carries the category crossing (resolved/reopened are
// derived at render time). Kept in sync with @pace/validation's activityActionSchema.
export const activityAction = pgEnum("activity_action", [
  "created",
  "title_changed",
  "description_changed",
  "status_changed",
  "start_changed",
  "due_changed",
  "reparented",
  "recurrence_changed",
  "tags_changed",
  "deleted",
  "restored",
])

export const taskActivity = pgTable(
  "task_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The task this entry belongs to. Cascade is only a hard-purge safety net — the everyday
    // task delete is soft (deleted_at), so history survives it.
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    action: activityAction("action").notNull(),
    // The change in text form; which columns are set depends on the action (created/deleted set
    // none). `field` names the sub-field where an action spans several (e.g. tags_changed →
    // 'added'/'removed'); ISO for dates, a status/tag id, the title text, or an RRULE body.
    field: text("field"),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    // Display snapshots (status name/colour, tag, parent title, recurrence text) captured at
    // write time so an entry still renders truthfully after what it references changes.
    meta: jsonb("meta").$type<ActivityMeta>(),
    // When the change happened — client-authored, shown in the feed. defaultNow() is only a
    // fallback for a client that omits it.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // When the server received it — server-owned audit/ordering tiebreaker. No `updated_at`
    // or `deleted_at`: this table is insert-only.
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The feed reads a task's entries newest-first.
    index("task_activity_task_id_idx").on(table.taskId, table.createdAt),
    index("task_activity_user_id_idx").on(table.userId),
  ],
)
