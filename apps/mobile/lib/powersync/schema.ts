import { column, Schema, Table } from "@powersync/react-native"

// The on-device SQLite mirror of the synced `tasks` rows — the mobile twin of
// apps/web's powersync/schema.ts (same sync contract, different platform SDK).
//
// PowerSync gives every table an implicit text `id` (the uuid). We omit `user_id`
// (sync rules already scope rows to this user) and `deleted_at` (soft-deleted
// rows fall out of the sync stream). SQLite has no boolean/timestamp types, so
// `completed` is an integer (0/1) and timestamps are ISO strings.
//
// TODO(post-M11): extract this + the connector's op-mapping into a shared
// @pace/powersync package (via @powersync/common) so web and mobile can't drift.
const tasks = new Table({
  title: column.text,
  description: column.text,
  completed: column.integer,
  // Optional schedule (P2-02): nullable ISO strings, like the other timestamps.
  start_date: column.text,
  due_date: column.text,
  // Whether a real time-of-day was picked (0/1) — a date-only entry stores a
  // fallback time, so this bit is what says to show/keep the time.
  start_has_time: column.integer,
  due_has_time: column.integer,
  created_at: column.text,
  updated_at: column.text,
})

export const AppSchema = new Schema({ tasks })

// Bump on ANY change above (add/remove/rename a table or column). On load,
// reconcileSchemaVersion (./db) rebuilds the local DB when this differs from the
// version it was last built with — because adding a column to a live DB leaves
// PowerSync's upload/crud capture stale (the value syncs on read but is dropped on
// upload). Keep in step with the web schema's SCHEMA_VERSION.
export const SCHEMA_VERSION = "1"
