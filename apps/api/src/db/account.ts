import { and, eq, isNotNull, lt } from "drizzle-orm"
import { account, session, user } from "./auth"
import { db } from "./index"

// Days a pending-deletion account is retained before permanent purge (the grace / recovery
// window). Kept here as the single source of truth for the 30-day rule.
export const DELETION_GRACE_DAYS = 30

// Account-lifecycle DB helpers for the Delete Account grace period. Kept out of auth.ts (the
// Better Auth *config*) so the sign-in reactivation hook and the request-deletion procedure
// share one home — mirrors how seedUserStatuses lives in db/seed.ts.

// The hashed password of the user's email/password ("credential") account, or null if they have
// none (e.g. a future social-only user). Used to reauthenticate before deletion.
export async function credentialPasswordHash(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
  return row?.password ?? null
}

// Arm deletion: stamp deletion_requested_at and revoke EVERY session/token for the user, so all
// devices sign out and can no longer mint a PowerSync JWT (sync stops). Deleting the session rows
// is what Better Auth reads, so this invalidates cookie + bearer alike. Returns the timestamp.
export async function markDeletionRequested(userId: string): Promise<Date> {
  const now = new Date()
  await db.update(user).set({ deletionRequestedAt: now }).where(eq(user.id, userId))
  await db.delete(session).where(eq(session.userId, userId))
  return now
}

// Reactivate: clear a pending deletion. Called from the sign-in hook — logging back in within the
// grace window cancels the deletion. Returns true if a pending flag was actually cleared (so the
// caller can surface "welcome back, deletion cancelled").
export async function clearDeletionRequest(userId: string): Promise<boolean> {
  const rows = await db
    .update(user)
    .set({ deletionRequestedAt: null })
    .where(and(eq(user.id, userId), isNotNull(user.deletionRequestedAt)))
    .returning({ id: user.id })
  return rows.length > 0
}

// Permanent purge: hard-delete every account whose grace window has elapsed. The FK cascades
// (tasks/statuses/tags/activity/settings/sessions/accounts all `onDelete: cascade`) wipe the rest
// in the same delete. Idempotent — only ever removes rows already past the cutoff. Returns the
// count purged. Run by the daily Nitro scheduled task (src/tasks/db/purge-deleted.ts).
export async function purgeExpiredDeletions(graceDays = DELETION_GRACE_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - graceDays * 86_400_000)
  const rows = await db
    .delete(user)
    .where(and(isNotNull(user.deletionRequestedAt), lt(user.deletionRequestedAt, cutoff)))
    .returning({ id: user.id })
  return rows.length
}
