import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { db } from "../src/db"
import { user } from "../src/db/auth"
import { tasks } from "../src/db/tasks"
import { appRouter } from "../src/trpc/router"

// A real user row (the tasks FK requires one). Returns its id.
async function makeUser(): Promise<string> {
  const id = randomUUID()
  const now = new Date()
  await db.insert(user).values({
    id,
    name: "Test User",
    email: `${id}@test.local`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

async function clean() {
  await db.delete(tasks)
  await db.delete(user)
}

beforeEach(clean)
afterEach(clean)

describe("tasks router", () => {
  it("create mints a server uuid and applies defaults", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const t = await caller.tasks.create({ title: "Buy milk" })
    expect(t.id).toBeTruthy()
    expect(t.description).toBe("")
    expect(t.completed).toBe(false)
    expect(t.deletedAt).toBeNull()
  })

  it("scopes list to the owner — users are isolated", async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    await appRouter.createCaller({ db, userId: u1 }).tasks.create({ title: "mine" })
    expect(await appRouter.createCaller({ db, userId: u1 }).tasks.list()).toHaveLength(1)
    expect(await appRouter.createCaller({ db, userId: u2 }).tasks.list()).toHaveLength(0)
  })

  it("won't let a user update someone else's task", async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    const t = await appRouter.createCaller({ db, userId: u1 }).tasks.create({ title: "mine" })
    await expect(
      appRouter.createCaller({ db, userId: u2 }).tasks.update({ id: t.id, completed: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("applies an owner's update", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const t = await caller.tasks.create({ title: "x" })
    const updated = await caller.tasks.update({ id: t.id, completed: true, description: "done" })
    expect(updated.completed).toBe(true)
    expect(updated.description).toBe("done")
  })

  it("soft delete hides the task from reads but keeps the row", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const t = await caller.tasks.create({ title: "x" })
    await caller.tasks.softDelete({ id: t.id })
    expect(await caller.tasks.list()).toHaveLength(0)

    const rows = await db.select().from(tasks).where(eq(tasks.id, t.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deletedAt).not.toBeNull()
  })

  // The Undo mechanism: after a soft delete, the client re-inserts the captured
  // row (same id), which replays as a create. Its upsert must clear deletedAt so
  // the task comes back — otherwise Undo would silently do nothing.
  it("re-creating a soft-deleted task (same id) restores it, clearing the tombstone", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const t = await caller.tasks.create({ title: "Buy milk", description: "2%" })
    await caller.tasks.softDelete({ id: t.id })
    expect(await caller.tasks.list()).toHaveLength(0)

    const restored = await caller.tasks.create({
      id: t.id,
      title: "Buy milk",
      description: "2%",
      completed: false,
    })
    expect(restored.id).toBe(t.id)
    expect(restored.deletedAt).toBeNull()
    expect(await caller.tasks.list()).toHaveLength(1)

    const rows = await db.select().from(tasks).where(eq(tasks.id, t.id))
    expect(rows[0]?.deletedAt).toBeNull()
  })

  // The restore path shares the create upsert's owner-scoped setWhere, so a
  // guessed id can neither hijack nor un-delete another user's task.
  it("re-create can't hijack or restore another user's task", async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    const t = await appRouter.createCaller({ db, userId: u1 }).tasks.create({ title: "mine" })
    await appRouter.createCaller({ db, userId: u1 }).tasks.softDelete({ id: t.id })

    await expect(
      appRouter.createCaller({ db, userId: u2 }).tasks.create({ id: t.id, title: "hijacked" }),
    ).rejects.toMatchObject({ code: "CONFLICT" })

    const rows = await db.select().from(tasks).where(eq(tasks.id, t.id))
    expect(rows[0]?.userId).toBe(u1)
    expect(rows[0]?.title).toBe("mine")
    expect(rows[0]?.deletedAt).not.toBeNull()
  })

  it("refuses an unauthenticated caller", async () => {
    await expect(appRouter.createCaller({ db, userId: null }).tasks.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })
})
