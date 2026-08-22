import { z } from "zod"

// A Task — defined once, here. This same schema validates API input, infers the
// frontend types, and mirrors the DB table (added in M08). Change the shape once
// and the whole stack follows.
//
// Sync-ready by construction (the M11 offline-first disciplines, baked in now):
//   - id:        a client-minted uuid, so a device can create tasks offline
//   - updatedAt: lets sync answer "what changed since?"
//   - deletedAt: a tombstone, so a delete propagates instead of a row vanishing
// How a repeating task regenerates on completion (P2-08): 'advance' reschedules the same task to
// its next occurrence; 'duplicate' leaves the completed task done and the server mints a fresh one.
export const regenSchema = z.enum(["advance", "duplicate"])
export type Regen = z.infer<typeof regenSchema>

export const taskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(500),
  description: z.string().default(""),
  // The task's current status — a row in `statuses` (P2-03). Replaces `completed`;
  // done-ness is derived from the status's category (open/in_progress/done).
  statusId: z.uuid(),
  // Server-owned: set when the task enters a `done` status, cleared when it leaves.
  resolvedAt: z.iso.datetime().nullable(),
  // Optional scheduling (P2-02): UTC ISO datetimes, null when unset. The *HasTime
  // flags say whether a real time-of-day was picked (vs a date-only entry, which
  // stores a fallback time) — so display can show a date alone.
  startDate: z.iso.datetime().nullable(),
  dueDate: z.iso.datetime().nullable(),
  startHasTime: z.boolean().default(false),
  dueHasTime: z.boolean().default(false),
  // Subtask hierarchy (P2-05): the parent task's id, or null for a top-level task.
  // A subtask is just a task with a parent; nesting is capped at 5 levels server-side.
  parentId: z.uuid().nullable(),
  // Manual ordering (P2-06): a fractional (LexoRank-style) sort key. Tasks render
  // `ORDER BY sortOrder, id` within a sibling scope (parentId); a drag rewrites only
  // this field on the moved task, so reorders are O(1) and converge under offline sync.
  sortOrder: z.string(),
  // Recurrence (P2-08): an RRULE (RFC 5545) body anchored to dueDate, or null when the task doesn't
  // repeat. recurrenceRegen decides what completion does (see regenSchema); null when not repeating.
  recurrence: z.string().nullable(),
  recurrenceRegen: regenSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})

export type Task = z.infer<typeof taskSchema>

// What a client supplies to create a task. `id` is optional: PowerSync clients
// mint the uuid locally so a task created offline has a stable identity before it
// ever reaches the server; callers that omit it get a DB-minted id. Timestamps
// stay server-owned. Derived from taskSchema so it can never drift from it.
export const newTaskSchema = taskSchema
  .pick({
    title: true,
    description: true,
  })
  .extend({
    id: taskSchema.shape.id.optional(),
    // The task's status. Optional on create: clients set it from their default group;
    // if omitted, the server assigns the user's default-group open status.
    statusId: taskSchema.shape.statusId.optional(),
    // Optional on create; both nullable (a task may start with no schedule).
    startDate: taskSchema.shape.startDate.optional(),
    dueDate: taskSchema.shape.dueDate.optional(),
    startHasTime: taskSchema.shape.startHasTime.optional(),
    dueHasTime: taskSchema.shape.dueHasTime.optional(),
    // Optional on create: set when minting a subtask, omitted for a top-level task.
    parentId: taskSchema.shape.parentId.optional(),
    // Optional on create: clients mint a bottom-of-scope key; if omitted, the server
    // assigns one (queries the scope's current max key).
    sortOrder: taskSchema.shape.sortOrder.optional(),
    // Optional on create: a task may be born repeating (usually set later via setRecurrence). Both
    // ride create so the server can mint the next occurrence in 'duplicate' mode.
    recurrence: taskSchema.shape.recurrence.optional(),
    recurrenceRegen: taskSchema.shape.recurrenceRegen.optional(),
  })

export type NewTask = z.infer<typeof newTaskSchema>

// A partial update: `id` names the row; any mutable field may be set, and an
// omitted field is left unchanged — so no defaults here (a default would blank a
// field you didn't send). `title` mirrors taskSchema's rule.
export const updateTaskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  statusId: z.uuid().optional(),
  // nullable + optional: omit = unchanged, null = clear the date.
  startDate: z.iso.datetime().nullable().optional(),
  dueDate: z.iso.datetime().nullable().optional(),
  startHasTime: z.boolean().optional(),
  dueHasTime: z.boolean().optional(),
  // A reorder (P2-06) is just an update of the fractional sort key.
  sortOrder: z.string().optional(),
})

export type UpdateTask = z.infer<typeof updateTaskSchema>

// Identifies a single task by id (used by softDelete).
export const taskIdSchema = z.object({ id: z.uuid() })

// Re-parent a task (P2-05): move it under another task, or null to promote it back to
// top-level. Parent changes go through their own mutation (deliberately NOT part of
// updateTaskSchema) so the depth/cycle guard has a single home and the connector maps a
// clean, single-purpose op.
export const setParentSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
})

export type SetParent = z.infer<typeof setParentSchema>

// Set (or clear) a task's recurrence (P2-08). Like setParent, recurrence changes go through their
// own mutation — the connector maps a clean single-purpose op, and the server guards it (the RRULE
// parses; the task has a dueDate to anchor to). `recurrence: null` stops repeating; `recurrenceRegen`
// is required alongside a rule and null when clearing.
export const setRecurrenceSchema = z.object({
  id: z.uuid(),
  recurrence: z.string().nullable(),
  recurrenceRegen: regenSchema.nullable(),
})

export type SetRecurrence = z.infer<typeof setRecurrenceSchema>
