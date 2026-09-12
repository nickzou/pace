import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { auth } from "../src/auth"
import { db } from "../src/db"
import { clearDeletionRequest, purgeExpiredDeletions } from "../src/db/account"
import { session, user } from "../src/db/auth"
import { appRouter } from "../src/trpc/router"

const PASSWORD = "Supersecret123!"

// A real Better Auth user, so the credential account + password hash exist (reauth needs them).
async function makeUser(email = `${randomUUID()}@test.local`): Promise<string> {
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "T" } })
  const [u] = await db.select().from(user).where(eq(user.email, email))
  if (!u) throw new Error(`user not created: ${email}`)
  return u.id
}
async function pendingAt(userId: string): Promise<Date | null> {
  const [u] = await db
    .select({ at: user.deletionRequestedAt })
    .from(user)
    .where(eq(user.id, userId))
  return u?.at ?? null
}
async function alive(userId: string): Promise<boolean> {
  return (await db.select({ id: user.id }).from(user).where(eq(user.id, userId))).length > 0
}
// Deleting users cascades to their statuses/sessions/accounts/etc (all onDelete: cascade).
const clean = () => db.delete(user)
beforeEach(clean)
afterEach(clean)

describe("account.requestDeletion", () => {
  it("rejects a wrong password and does not arm deletion", async () => {
    const id = await makeUser()
    const caller = appRouter.createCaller({ db, userId: id })
    await expect(
      caller.account.requestDeletion({ password: "WrongPass123!", confirmation: "DELETE" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
    expect(await pendingAt(id)).toBeNull()
  })

  it("rejects an un-typed confirmation (schema)", async () => {
    const id = await makeUser()
    const caller = appRouter.createCaller({ db, userId: id })
    await expect(
      // wrong confirmation word — the z.literal("DELETE") rejects it before the handler runs
      caller.account.requestDeletion({ password: PASSWORD, confirmation: "delete" as "DELETE" }),
    ).rejects.toBeTruthy()
    expect(await pendingAt(id)).toBeNull()
  })

  it("arms the grace period and revokes all sessions on correct reauth", async () => {
    const id = await makeUser()
    // a live session to prove revocation
    await db.insert(session).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: id,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const caller = appRouter.createCaller({ db, userId: id })
    const res = await caller.account.requestDeletion({ password: PASSWORD, confirmation: "DELETE" })

    expect(res.deletionRequestedAt).toBeTruthy()
    expect(await pendingAt(id)).not.toBeNull()
    const sessions = await db.select().from(session).where(eq(session.userId, id))
    expect(sessions.length).toBe(0) // every device signed out
  })
})

describe("reactivation (clearDeletionRequest)", () => {
  it("clears a pending deletion, returns true", async () => {
    const id = await makeUser()
    await db.update(user).set({ deletionRequestedAt: new Date() }).where(eq(user.id, id))
    expect(await clearDeletionRequest(id)).toBe(true)
    expect(await pendingAt(id)).toBeNull()
  })

  it("is a no-op when nothing is pending, returns false", async () => {
    const id = await makeUser()
    expect(await clearDeletionRequest(id)).toBe(false)
  })
})

describe("purgeExpiredDeletions", () => {
  it("hard-deletes only accounts past the grace window", async () => {
    const expired = await makeUser()
    const recent = await makeUser()
    const active = await makeUser()
    await db
      .update(user)
      .set({ deletionRequestedAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(user.id, expired))
    await db
      .update(user)
      .set({ deletionRequestedAt: new Date(Date.now() - 10 * 86_400_000) })
      .where(eq(user.id, recent))

    const purged = await purgeExpiredDeletions(30)

    expect(purged).toBe(1)
    expect(await alive(expired)).toBe(false) // past window → gone (cascade wipes their data)
    expect(await alive(recent)).toBe(true) // within window → kept
    expect(await alive(active)).toBe(true) // never requested → kept
  })

  it("purges nothing when no account is past the window", async () => {
    const id = await makeUser()
    await db.update(user).set({ deletionRequestedAt: new Date() }).where(eq(user.id, id))
    expect(await purgeExpiredDeletions(30)).toBe(0)
    expect(await alive(id)).toBe(true)
  })
})
