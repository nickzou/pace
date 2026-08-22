import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

// Custom statuses (P2-03) — the persistence mirror of @pace/validation's status
// schemas. A user-scoped library: `status_groups` are named lists; `statuses` belong to
// a group; a task references a status (tasks.status_id). `user_settings` holds the first
// synced per-user preference. Conventions mirror `tasks`: client-mintable uuid, user FK
// (cascade), timestamptz, soft-delete tombstone.
//
// NOTE: this is the FINAL shape. The migration that introduces it is hand-written
// (expand → seed → backfill from `completed` → drop `completed`) so existing tasks keep
// their done state — a plain drizzle-kit diff would not be data-safe.

// The lifecycle category the app keys behaviour off (open/in_progress = active; done =
// resolved). Kept in sync with @pace/validation's statusCategorySchema.
export const statusCategory = pgEnum("status_category", ["open", "in_progress", "done"])

export const statusGroups = pgTable(
  "status_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("status_groups_user_id_idx").on(table.userId)],
)

export const statuses = pgTable(
  "statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => statusGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(), // one of @pace/tokens STATUS_COLORS keys
    category: statusCategory("category").notNull(),
    position: integer("position").notNull().default(0),
    isSystem: boolean("is_system").notNull().default(false), // seeded To Do/Done — protected
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("statuses_user_id_idx").on(table.userId),
    index("statuses_group_id_idx").on(table.groupId),
  ],
)

// One row per user — the first synced preference. `custom_statuses_enabled` gates the
// whole feature's UI (off ⇒ today's checkbox behaviour on the default group).
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  customStatusesEnabled: boolean("custom_statuses_enabled").notNull().default(false),
  // Recurrence (P2-08) needs the user's local calendar day: an IANA timezone, auto-detected by the
  // client and overridable in Settings. `timezoneAuto` keeps auto-detection on until they pin one.
  timezone: text("timezone"),
  timezoneAuto: boolean("timezone_auto").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})
