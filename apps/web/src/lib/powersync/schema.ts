import { column, Schema, Table } from "@powersync/web"

// The on-device SQLite mirror of synced rows. Both `tasks` (legacy) and `items`
// (generic resource) are included to demonstrate the offline-first pattern.
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
  created_at: column.text,
  updated_at: column.text,
})

const items = new Table({
  title: column.text,
  description: column.text,
  completed: column.integer,
  created_at: column.text,
  updated_at: column.text,
})

export const AppSchema = new Schema({ tasks, items })
