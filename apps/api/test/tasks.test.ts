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

  it("refuses an unauthenticated caller", async () => {
    await expect(appRouter.createCaller({ db, userId: null }).tasks.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })
})
