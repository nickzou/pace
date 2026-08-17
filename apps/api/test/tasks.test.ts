import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { db } from "../src/db"
import { user } from "../src/db/auth"
import { seedUserStatuses } from "../src/db/seed"
import { statuses, statusGroups, userSettings } from "../src/db/statuses"
import { tasks } from "../src/db/tasks"
import { appRouter } from "../src/trpc/router"

// A real user row (the tasks FK requires one) plus their seeded default statuses
// (create() needs a default status to assign). Returns the user id.
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
  await seedUserStatuses(id)
  return id
}

// The seeded status of a given category (To Do = open, Done = done).
async function statusIdByCategory(userId: string, category: "open" | "done"): Promise<string> {
  const [row] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(and(eq(statuses.userId, userId), eq(statuses.category, category)))
  if (!row) throw new Error(`no ${category} status seeded`)
  return row.id
}

async function clean() {
  await db.delete(tasks)
  await db.delete(statuses)
  await db.delete(statusGroups)
  await db.delete(userSettings)
  await db.delete(user)
}

beforeEach(clean)
afterEach(clean)

describe("tasks router", () => {
  it("create mints a server uuid, applies defaults, and assigns the default status", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const t = await caller.tasks.create({ title: "Buy milk" })
    expect(t.id).toBeTruthy()
    expect(t.description).toBe("")
    expect(t.statusId).toBeTruthy() // the seeded default (open) status
    expect(t.resolvedAt).toBeNull() // open → not resolved
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
      appRouter.createCaller({ db, userId: u2 }).tasks.update({ id: t.id, description: "hacked" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  it("applies an owner's update", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const t = await caller.tasks.create({ title: "x" })
    const updated = await caller.tasks.update({ id: t.id, description: "done" })
    expect(updated.description).toBe("done")
  })

  // Setting a `done` status stamps resolved_at; moving back to open clears it.
  it("derives resolved_at from the status category", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const t = await caller.tasks.create({ title: "x" })
    expect(t.resolvedAt).toBeNull()

    const done = await caller.tasks.update({
      id: t.id,
      statusId: await statusIdByCategory(userId, "done"),
    })
    expect(done.resolvedAt).not.toBeNull()

    const reopened = await caller.tasks.update({
      id: t.id,
      statusId: await statusIdByCategory(userId, "open"),
    })
    expect(reopened.resolvedAt).toBeNull()
  })

  // A task can't reference a status the user doesn't own.
  it("rejects a status that isn't the user's", async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    const foreignStatus = await statusIdByCategory(u2, "open")
    await expect(
      appRouter
        .createCaller({ db, userId: u1 })
        .tasks.create({ title: "x", statusId: foreignStatus }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
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

  // The Undo mechanism: after a soft delete, the client re-inserts the captured row
  // (same id), which replays as a create. Its upsert must clear deletedAt so the task
  // comes back — otherwise Undo would silently do nothing.
  it("re-creating a soft-deleted task (same id) restores it, clearing the tombstone", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const t = await caller.tasks.create({ title: "Buy milk", description: "2%" })
    await caller.tasks.softDelete({ id: t.id })
    expect(await caller.tasks.list()).toHaveLength(0)

    const restored = await caller.tasks.create({ id: t.id, title: "Buy milk", description: "2%" })
    expect(restored.id).toBe(t.id)
    expect(restored.deletedAt).toBeNull()
    expect(await caller.tasks.list()).toHaveLength(1)

    const rows = await db.select().from(tasks).where(eq(tasks.id, t.id))
    expect(rows[0]?.deletedAt).toBeNull()
  })

  // The restore path shares the create upsert's owner-scoped setWhere, so a guessed id
  // can neither hijack nor un-delete another user's task.
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

  // P2-02 scheduling: dates round-trip as UTC ISO through the timestamptz columns
  // (create/update convert ISO→Date, toTask converts back), and a null update clears.
  it("round-trips start/due dates and clears with null", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const due = "2026-08-15T17:00:00.000Z"
    const created = await caller.tasks.create({ title: "scheduled", dueDate: due })
    expect(created.dueDate).toBe(due)
    expect(created.startDate).toBeNull()

    const start = "2026-08-14T09:00:00.000Z"
    const updated = await caller.tasks.update({ id: created.id, startDate: start })
    expect(updated.startDate).toBe(start)
    expect(updated.dueDate).toBe(due) // untouched by a partial update

    const cleared = await caller.tasks.update({ id: created.id, dueDate: null })
    expect(cleared.dueDate).toBeNull()
    expect(cleared.startDate).toBe(start) // still set
  })

  // A date always stores a full timestamp; the hasTime flag records whether the user
  // picked a real time-of-day, so an explicit 23:59 isn't read as "no time".
  it("tracks whether a time-of-day was set (hasTime)", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const withTime = await caller.tasks.create({
      title: "meeting",
      dueDate: "2026-08-15T21:59:00.000Z",
      dueHasTime: true,
    })
    expect(withTime.dueHasTime).toBe(true)
    expect(withTime.startHasTime).toBe(false) // defaults false when unset

    const dateOnly = await caller.tasks.update({ id: withTime.id, dueHasTime: false })
    expect(dateOnly.dueHasTime).toBe(false)
    expect(dateOnly.dueDate).toBe("2026-08-15T21:59:00.000Z")
  })

  it("refuses an unauthenticated caller", async () => {
    await expect(appRouter.createCaller({ db, userId: null }).tasks.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })
})
