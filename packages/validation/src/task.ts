import { z } from "zod"

// A Task — defined once, here. This same schema validates API input, infers the
// frontend types, and mirrors the DB table (added in M08). Change the shape once
// and the whole stack follows.
//
// Sync-ready by construction (the M11 offline-first disciplines, baked in now):
//   - id:        a client-minted uuid, so a device can create tasks offline
//   - updatedAt: lets sync answer "what changed since?"
//   - deletedAt: a tombstone, so a delete propagates instead of a row vanishing
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
})

export type UpdateTask = z.infer<typeof updateTaskSchema>

// Identifies a single task by id (used by softDelete).
export const taskIdSchema = z.object({ id: z.uuid() })
