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
  completed: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})

export type Task = z.infer<typeof taskSchema>

// What a client supplies to create a task; the server owns id + timestamps.
// Derived from taskSchema so it can never drift from it (description/completed keep
// their defaults, so they're optional here).
export const newTaskSchema = taskSchema.pick({
  title: true,
  description: true,
  completed: true,
})

export type NewTask = z.infer<typeof newTaskSchema>

// A partial update: `id` names the row; any mutable field may be set, and an
// omitted field is left unchanged — so no defaults here (a default would blank a
// field you didn't send). `title` mirrors taskSchema's rule.
export const updateTaskSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
})

export type UpdateTask = z.infer<typeof updateTaskSchema>

// Identifies a single task by id (used by softDelete).
export const taskIdSchema = z.object({ id: z.uuid() })
