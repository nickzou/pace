import { column, Schema, Table } from "@powersync/web"

// The on-device SQLite mirror of the synced `tasks` rows. This is imported only
// from the browser (the provider dynamic-imports it), never during SSR.
//
// A few PowerSync/SQLite realities shape this:
//   - every table gets an implicit text `id` (the uuid), so we don't declare it
//   - we omit `user_id`: the sync rules already scope rows to the signed-in user,
//     so every row on this device is already ours
//   - we omit `deleted_at`: soft-deleted rows fall out of the sync stream, so the
//     device simply never has them
//   - SQLite has no boolean/timestamp types — `completed` is an integer (0/1) and
//     timestamps are ISO strings
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

// Bump this on ANY change above (add/remove/rename a table or column). On load,
// reconcileSchemaVersion (./db) compares it to the version the on-device DB was
// built with and, on a mismatch, rebuilds the local DB clean — because adding a
// column to a live DB leaves PowerSync's upload/crud capture stale (the value syncs
// on read but is silently dropped on upload). This is what a manual sign-out did
// by hand; the guard makes returning users self-heal without one.
export const SCHEMA_VERSION = "1"
