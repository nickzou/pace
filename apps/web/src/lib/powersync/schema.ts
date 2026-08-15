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
  created_at: column.text,
  updated_at: column.text,
})

export const AppSchema = new Schema({ tasks })
