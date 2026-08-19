import { column, Schema, Table } from "@powersync/react-native"

// The on-device SQLite mirror of the synced rows — the mobile twin of apps/web's
// powersync/schema.ts (same sync contract, different platform SDK).
//
// PowerSync gives every table an implicit text `id` (the source PK). We omit `user_id`
// (sync rules already scope rows to this user) and `deleted_at` (soft-deleted rows fall
// out of the sync stream). SQLite has no boolean/timestamp types — booleans are integers
// (0/1) and timestamps are ISO strings.
//
// TODO(post-M11): extract this + the connector's op-mapping into a shared
// @pace/powersync package (via @powersync/common) so web and mobile can't drift.
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

export const AppSchema = new Schema({
  tasks,
  status_groups,
  statuses,
  user_settings,
  tags,
  task_tags,
})

// Bump on ANY change above. On load, reconcileSchemaVersion (./db) rebuilds the local DB
// when this differs from the version it was last built with — because adding a column to
// a live DB leaves PowerSync's upload/crud capture stale. Keep in step with the web
// schema's SCHEMA_VERSION.
//
// v2 (P2-03): tasks completed → status_id/resolved_at; + status_groups/statuses/
// user_settings tables.
// v3 (P2-04): + tags/task_tags tables.
export const SCHEMA_VERSION = "3"
