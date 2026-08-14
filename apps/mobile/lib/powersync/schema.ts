import { column, Schema, Table } from "@powersync/react-native"

// The on-device SQLite mirror of synced rows — the mobile twin of
// apps/web's powersync/schema.ts (same sync contract, different platform SDK).
// Both `tasks` (legacy) and `items` (generic resource) are included.
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
