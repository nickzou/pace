import { column, Schema, Table } from "@powersync/web"

// The on-device SQLite mirror of the synced rows. Imported only from the browser (the
// provider dynamic-imports it), never during SSR.
//
// A few PowerSync/SQLite realities shape this:
//   - every table gets an implicit text `id` (the source PK), so we don't declare it
//   - we omit `user_id`: the sync rules already scope rows to the signed-in user
//   - we omit `deleted_at`: soft-deleted rows fall out of the sync stream
//   - SQLite has no boolean/timestamp types — booleans are integers (0/1), timestamps
//     are ISO strings
const tasks = new Table({
  title: column.text,
  description: column.text,
  // The task's current status (P2-03) — a `statuses.id`. resolved_at is set when the
  // task is on a `done` status.
  status_id: column.text,
  resolved_at: column.text,
  // Optional schedule (P2-02): nullable ISO strings.
  start_date: column.text,
  due_date: column.text,
  // Whether a real time-of-day was picked (0/1).
  start_has_time: column.integer,
  due_has_time: column.integer,
  // Subtask hierarchy (P2-05): the parent task's id, or null for a top-level task.
  parent_id: column.text,
  // Manual ordering (P2-06): the fractional sort key. Tasks list `ORDER BY sort_order, id`
  // within a parent scope; a drag rewrites only this field on the moved task.
  sort_order: column.text,
  // Recurrence (P2-08): the RRULE body (null when not repeating) + 'advance' | 'duplicate' regen mode.
  recurrence: column.text,
  recurrence_regen: column.text,
  created_at: column.text,
  updated_at: column.text,
})

// Custom statuses (P2-03). Groups are the user's status lists; statuses belong to a
// group and carry a palette-key colour + a lifecycle category.
const status_groups = new Table({
  name: column.text,
  is_default: column.integer,
  position: column.integer,
  created_at: column.text,
  updated_at: column.text,
})

const statuses = new Table({
  group_id: column.text,
  name: column.text,
  color: column.text, // one of @pace/tokens STATUS_COLORS keys
  category: column.text, // 'open' | 'in_progress' | 'done'
  position: column.integer,
  is_system: column.integer,
  created_at: column.text,
  updated_at: column.text,
})

// One row per user (implicit id = user_id) — the enable toggle.
const user_settings = new Table({
  custom_statuses_enabled: column.integer,
  // P2-08: IANA timezone for recurrence math + whether it's auto-detected (0/1).
  timezone: column.text,
  timezone_auto: column.integer,
})

// Tags (P2-04) — a flat, user-scoped tag library (always on, no enable gate).
const tags = new Table({
  name: column.text,
  color: column.text, // one of @pace/tokens STATUS_COLORS keys
  position: column.integer,
  created_at: column.text,
  updated_at: column.text,
})

// The task↔tag join. Its implicit id is the deterministic `${task_id}_${tag_id}`. No
// deleted_at — a link is hard-deleted (removing it IS the unassign).
const task_tags = new Table({
  task_id: column.text,
  tag_id: column.text,
  created_at: column.text,
})

// Task activity history (P3-08) — an append-only audit trail, one immutable row per change.
// Clients read this table; they insert once (at mutation time) and never update/delete it.
// `meta` is a JSON string (display snapshots); `created_at` is when the change happened
// (client-authored), `recorded_at` is server-stamped on upload.
const task_activity = new Table({
  task_id: column.text,
  action: column.text,
  field: column.text,
  from_value: column.text,
  to_value: column.text,
  meta: column.text,
  created_at: column.text,
  recorded_at: column.text,
})

export const AppSchema = new Schema({
  tasks,
  status_groups,
  statuses,
  user_settings,
  tags,
  task_tags,
  task_activity,
})

// Bump this on ANY change above (add/remove/rename a table or column). On load,
// reconcileSchemaVersion (./db) compares it to the version the on-device DB was built
// with and, on a mismatch, rebuilds the local DB clean — because adding a column to a
// live DB leaves PowerSync's upload/crud capture stale. Returning users self-heal
// without a manual sign-out.
//
// v2 (P2-03): tasks completed → status_id/resolved_at; + status_groups/statuses/
// user_settings tables.
// v3 (P2-04): + tags/task_tags tables.
// v4 (P2-05): + tasks.parent_id (subtask hierarchy).
// v5 (P2-06): + tasks.sort_order (manual ordering / drag-and-drop).
// v6 (P2-08): + tasks.recurrence / recurrence_regen + user_settings.timezone / timezone_auto
// (repeating tasks: the rule, its regen mode, and the zone recurrence math runs in).
// v7 (P3-08): + task_activity table (append-only per-task history).
export const SCHEMA_VERSION = "7"
