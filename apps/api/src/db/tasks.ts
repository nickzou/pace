import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

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
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("tasks_user_id_idx").on(table.userId)],
)
