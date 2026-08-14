import { z } from "zod"

// An Item — a generic synced resource. Defined once, here. This same schema
// validates API input, infers the frontend types, and mirrors the DB table.
// Change the shape once and the whole stack follows.
//
// Sync-ready by construction (the offline-first disciplines, baked in):
//   - id:        a client-minted uuid, so a device can create items offline
//   - updatedAt: lets sync answer "what changed since?"
//   - deletedAt: a tombstone, so a delete propagates instead of a row vanishing
export const itemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().default(""),
  completed: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
})

export type Item = z.infer<typeof itemSchema>

// What a client supplies to create an item. `id` is optional: PowerSync clients
// mint the uuid locally so an item created offline has a stable identity before
// it ever reaches the server; callers that omit it get a DB-minted id. Timestamps
// stay server-owned. Derived from itemSchema so it can never drift from it.
export const newItemSchema = itemSchema
  .pick({
    title: true,
    description: true,
    completed: true,
  })
  .extend({ id: itemSchema.shape.id.optional() })

export type NewItem = z.infer<typeof newItemSchema>

// A partial update: `id` names the row; any mutable field may be set, and an
// omitted field is left unchanged — so no defaults here (a default would blank a
// field you didn't send). `title` mirrors itemSchema's rule.
export const updateItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
})

export type UpdateItem = z.infer<typeof updateItemSchema>

// Identifies a single item by id (used by softDelete).
export const itemIdSchema = z.object({ id: z.string().uuid() })
