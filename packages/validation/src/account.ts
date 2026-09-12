import { z } from "zod"

// Account lifecycle (Delete Account) — the shared shapes for self-serve deletion. Deletion is
// gated by reauth: the user re-enters their current password AND types the confirmation word, so
// an idle/hijacked session can't wipe the account with one click. Both are enforced server-side
// (the request-deletion procedure) and drive the client confirm modal.

// The exact word the user must type to confirm — a deliberate, un-fat-fingerable action.
export const DELETE_CONFIRMATION = "DELETE"

export const requestDeletionSchema = z.object({
  // Current password, re-entered to reauthenticate (verified against the account server-side).
  password: z.string().min(1),
  // Must be exactly the confirmation word — a literal so anything else fails validation.
  confirmation: z.literal(DELETE_CONFIRMATION),
})
export type RequestDeletion = z.infer<typeof requestDeletionSchema>
