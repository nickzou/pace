import { STATUS_COLORS } from "@pace/tokens"
import { z } from "zod"

// Tags (P2-04) — a flat, user-scoped library, orthogonal to statuses. A task has 0..n tags
// (many-to-many via task_tags). Sync-ready like statuses/tasks: client-minted ids,
// updatedAt for change detection, deletedAt tombstones. Colour reuses the P2-03 palette
// (@pace/tokens STATUS_COLORS) — the app resolves the hex per theme.
export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
  color: z.enum(STATUS_COLORS),
  position: z.number().int().default(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})
export type Tag = z.infer<typeof tagSchema>

export const newTagSchema = tagSchema.pick({ name: true, color: true }).extend({
  id: tagSchema.shape.id.optional(),
  position: tagSchema.shape.position.optional(),
})
export type NewTag = z.infer<typeof newTagSchema>

export const updateTagSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50).optional(),
  color: z.enum(STATUS_COLORS).optional(),
  position: z.number().int().optional(),
})
export type UpdateTag = z.infer<typeof updateTagSchema>

// Identify a single tag by id (delete).
export const tagIdSchema = z.object({ id: z.uuid() })

// Assign / unassign a tag to a task — the task_tags join. The server derives the link's
// deterministic id (`${taskId}_${tagId}`) and user_id; the client only sends the pair.
export const taskTagSchema = z.object({
  taskId: z.uuid(),
  tagId: z.uuid(),
})
export type TaskTag = z.infer<typeof taskTagSchema>
