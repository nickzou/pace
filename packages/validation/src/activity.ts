import { z } from "zod"

// Task activity history (P3-08) — a per-task, append-only audit trail. Defined once here so
// the API, DB, and clients all follow the same shape.
//
// Append-only by construction: rows are minted, never edited or deleted. So — unlike tasks —
// there is NO updateActivitySchema, no deletedAt tombstone, and no updatedAt. A task being
// deleted or restored is itself just another activity row, not a mutation of history.
//
// Sync-ready like tasks: client-minted `id` (a device records activity offline) and a
// client-authored `createdAt` (when the change actually happened, in the user's own time).
// `recordedAt` is server-owned — stamped on upload as the tamper-evident audit anchor.

// The kinds of change we record. Split start/due (rather than one `rescheduled`) keeps the
// reschedule metric — count of `due_changed` — clean. `status_changed` carries the category
// crossing, so resolved/reopened are derived from the from/to statuses at render time, not
// separate actions.
export const activityActionSchema = z.enum([
  "created",
  "title_changed",
  "description_changed",
  "status_changed",
  "start_changed",
  "due_changed",
  "reparented",
  "recurrence_changed",
  "tags_changed",
  "deleted",
  "restored",
])
export type ActivityAction = z.infer<typeof activityActionSchema>

// Display snapshots captured at write time, so an entry still renders truthfully after the
// thing it references changes — a status renamed/deleted, a tag recoloured. These are
// deliberately loose strings (not the STATUS_COLORS / category enums): a historical snapshot
// must never fail validation because today's palette or vocabulary has moved on.
const statusSnapshotSchema = z.object({
  name: z.string(),
  color: z.string(),
  category: z.string(),
})
const tagSnapshotSchema = z.object({
  name: z.string(),
  color: z.string(),
})

export const activityMetaSchema = z.object({
  // status_changed
  fromStatus: statusSnapshotSchema.optional(),
  toStatus: statusSnapshotSchema.optional(),
  // tags_changed (field = 'added' | 'removed')
  tag: tagSnapshotSchema.optional(),
  // reparented (null title = top-level)
  fromParentTitle: z.string().nullable().optional(),
  toParentTitle: z.string().nullable().optional(),
  // recurrence_changed — human text via rrule.toText(), null when cleared
  recurrenceText: z.string().nullable().optional(),
})
export type ActivityMeta = z.infer<typeof activityMetaSchema>

// One entry in a task's history. `field`/`fromValue`/`toValue` hold the change in text form
// (ISO for dates, a status/tag id, the title text, an RRULE body); which of them are set
// depends on the action (e.g. `created`/`deleted` set none). Mirrors the DB row minus the
// DB-only `userId`, which is stripped at the API edge (same as tasks).
export const taskActivitySchema = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  action: activityActionSchema,
  field: z.string().nullable(),
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  meta: activityMetaSchema.nullable(),
  // When the change happened — client-authored, shown in the feed.
  createdAt: z.iso.datetime(),
  // When the server received it — server-owned, the audit/ordering tiebreaker.
  recordedAt: z.iso.datetime(),
})
export type TaskActivity = z.infer<typeof taskActivitySchema>

// What a client appends. `id` is optional (client-minted uuid for offline capture; server mints
// one otherwise). `createdAt` optional — clients send their local timestamp; the server falls
// back to now(). `recordedAt` is never client-supplied. There is deliberately no update/delete
// counterpart: activity is insert-only.
export const newTaskActivitySchema = taskActivitySchema
  .pick({ taskId: true, action: true })
  .extend({
    id: taskActivitySchema.shape.id.optional(),
    field: taskActivitySchema.shape.field.optional(),
    fromValue: taskActivitySchema.shape.fromValue.optional(),
    toValue: taskActivitySchema.shape.toValue.optional(),
    meta: taskActivitySchema.shape.meta.optional(),
    createdAt: taskActivitySchema.shape.createdAt.optional(),
  })
export type NewTaskActivity = z.infer<typeof newTaskActivitySchema>

// Read a task's history (the seam for the REST API / analytics — clients read local SQLite
// directly). Newest-first, keyset-paginated on `createdAt`.
export const taskActivityQuerySchema = z.object({
  taskId: z.uuid(),
  limit: z.number().int().min(1).max(200).optional(),
  before: z.iso.datetime().optional(),
})
export type TaskActivityQuery = z.infer<typeof taskActivityQuerySchema>
