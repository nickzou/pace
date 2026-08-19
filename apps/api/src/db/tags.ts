import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { tasks } from "./tasks"

// Tags (P2-04) — the persistence mirror of @pace/validation's tag schemas. A flat,
// user-scoped library (`tags`) plus a many-to-many join to tasks (`task_tags`) — Pace's
// first join table. Conventions mirror `tasks`/`statuses`: client-mintable uuid, user FK
// (cascade), timestamptz, soft-delete tombstone. Tags are always on (no user_settings gate).
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(), // one of @pace/tokens STATUS_COLORS keys
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("tags_user_id_idx").on(table.userId)],
)

// The task↔tag link. The `id` is deterministic (`${taskId}_${tagId}`, set server-side) so
// an assign is idempotent and offline-conflict-free (both devices mint the same row). No
// soft-delete: a link has no independent lifecycle — deleting it IS the unassign. `userId`
// is denormalized so the PowerSync stream can scope without a join (server-set, never trusted).
export const taskTags = pgTable(
  "task_tags",
  {
    id: text("id").primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("task_tags_task_tag_uq").on(table.taskId, table.tagId),
    index("task_tags_user_id_idx").on(table.userId),
    index("task_tags_tag_id_idx").on(table.tagId),
  ],
)
