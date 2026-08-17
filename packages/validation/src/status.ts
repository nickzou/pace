import { STATUS_COLORS } from "@pace/tokens"
import { z } from "zod"

// Custom statuses (P2-03) — the shared shapes for the status system, defined once here
// so the API, DB, and clients all follow. Sync-ready like tasks: client-minted ids,
// updatedAt for change detection, deletedAt tombstones.

// The three lifecycle categories the app keys its BEHAVIOUR off (not the user's label):
// `open`/`in_progress` are active (count toward Today/Overdue); `done` is resolved.
// Success-vs-failure is expressed by having multiple `done` statuses, not a 4th value.
export const statusCategorySchema = z.enum(["open", "in_progress", "done"])
export type StatusCategory = z.infer<typeof statusCategorySchema>

// A named collection of statuses (a "status list"). Every user has one `isDefault` group.
export const statusGroupSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
  isDefault: z.boolean().default(false),
  position: z.number().int().default(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})
export type StatusGroup = z.infer<typeof statusGroupSchema>

export const newStatusGroupSchema = statusGroupSchema.pick({ name: true }).extend({
  id: statusGroupSchema.shape.id.optional(),
  isDefault: statusGroupSchema.shape.isDefault.optional(),
  position: statusGroupSchema.shape.position.optional(),
})
export type NewStatusGroup = z.infer<typeof newStatusGroupSchema>

export const updateStatusGroupSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50).optional(),
  position: z.number().int().optional(),
})
export type UpdateStatusGroup = z.infer<typeof updateStatusGroupSchema>

// A single status within a group. `color` is one of the 12 palette keys (@pace/tokens
// STATUS_COLORS) — the app resolves the hex per theme. `isSystem` marks the seeded
// To Do/Done: renamable/recolourable but not deletable.
export const statusSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  name: z.string().min(1).max(50),
  color: z.enum(STATUS_COLORS),
  category: statusCategorySchema,
  position: z.number().int().default(0),
  isSystem: z.boolean().default(false),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().nullable(),
})
export type Status = z.infer<typeof statusSchema>

export const newStatusSchema = statusSchema
  .pick({ groupId: true, name: true, color: true, category: true })
  .extend({
    id: statusSchema.shape.id.optional(),
    position: statusSchema.shape.position.optional(),
  })
export type NewStatus = z.infer<typeof newStatusSchema>

export const updateStatusSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50).optional(),
  color: z.enum(STATUS_COLORS).optional(),
  category: statusCategorySchema.optional(),
  position: z.number().int().optional(),
})
export type UpdateStatus = z.infer<typeof updateStatusSchema>

// Per-user preferences that sync — P2-03 introduces the first (`customStatusesEnabled`).
export const userSettingsSchema = z.object({
  customStatusesEnabled: z.boolean().default(false),
})
export type UserSettings = z.infer<typeof userSettingsSchema>

export const updateUserSettingsSchema = userSettingsSchema.partial()
export type UpdateUserSettings = z.infer<typeof updateUserSettingsSchema>

// Reorder payload (groups or statuses): the ids in their new order.
export const reorderSchema = z.object({ ids: z.array(z.uuid()) })

// Identify a single row by id (delete).
export const statusIdSchema = z.object({ id: z.uuid() })
