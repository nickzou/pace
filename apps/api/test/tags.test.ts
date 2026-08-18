import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { db } from "../src/db"
import { user } from "../src/db/auth"
import { seedUserStatuses } from "../src/db/seed"
import { statuses, statusGroups, userSettings } from "../src/db/statuses"
import { tags, taskTags } from "../src/db/tags"
import { tasks } from "../src/db/tasks"
import { appRouter } from "../src/trpc/router"

// P2-04 · tags router. A flat user-scoped library (create/update/reorder/softDelete) plus
// the task↔tag join (assign/unassign). Everything is scoped to ctx.userId, creates are
// client-mintable upserts, and the join id is deterministic — the properties worth pinning.

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
  await seedUserStatuses(id) // tasks.create() needs a default status to assign
  return id
}

// A live task owned by the user — the left side of an assign.
async function makeTask(userId: string, title = "Task"): Promise<string> {
  const caller = appRouter.createCaller({ db, userId })
  const t = await caller.tasks.create({ title })
  return t.id
}

async function clean() {
  await db.delete(taskTags)
  await db.delete(tags)
  await db.delete(tasks)
  await db.delete(statuses)
  await db.delete(statusGroups)
  await db.delete(userSettings)
  await db.delete(user)
}

beforeEach(clean)
afterEach(clean)

describe("tags.create", () => {
  it("mints a server id and stores the tag scoped to the user", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const id = await caller.tags.create({ name: "Work", color: "blue", position: 0 })
    expect(id).toBeTruthy()
    const [row] = await db.select().from(tags).where(eq(tags.id, id))
    expect(row?.userId).toBe(userId)
    expect(row?.name).toBe("Work")
    expect(row?.color).toBe("blue")
    expect(row?.deletedAt).toBeNull()
  })

  it("upserts idempotently on a client-minted id, and un-tombstones on re-create", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const id = randomUUID()
    await caller.tags.create({ id, name: "Home", color: "green" })
    // Soft-delete then re-create with the same id → the row is revived, not duplicated.
    await caller.tags.softDelete({ id })
    await caller.tags.create({ id, name: "Home renamed", color: "amber" })
    const rows = await db.select().from(tags).where(eq(tags.id, id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe("Home renamed")
    expect(rows[0]?.color).toBe("amber")
    expect(rows[0]?.deletedAt).toBeNull()
  })
})

describe("tags.update", () => {
  it("renames and recolours a live tag", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const id = await caller.tags.create({ name: "Wrk", color: "blue" })
    await caller.tags.update({ id, name: "Work", color: "green" })
    const [row] = await db.select().from(tags).where(eq(tags.id, id))
    expect(row?.name).toBe("Work")
    expect(row?.color).toBe("green")
  })

  it("cannot touch another user's tag", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const id = await appRouter.createCaller({ db, userId: owner }).tags.create({
      name: "Private",
      color: "red",
    })
    await expect(
      appRouter.createCaller({ db, userId: other }).tags.update({ id, name: "Hacked" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    const [row] = await db.select().from(tags).where(eq(tags.id, id))
    expect(row?.name).toBe("Private")
  })
})

describe("tags.assign / unassign", () => {
  it("links a task and tag with a deterministic id, idempotently", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const taskId = await makeTask(userId)
    const tagId = await caller.tags.create({ name: "Urgent", color: "red" })

    await caller.tags.assign({ taskId, tagId })
    await caller.tags.assign({ taskId, tagId }) // second assign is a no-op, not a duplicate

    const links = await db.select().from(taskTags).where(eq(taskTags.tagId, tagId))
    expect(links).toHaveLength(1)
    expect(links[0]?.id).toBe(`${taskId}_${tagId}`)
    expect(links[0]?.userId).toBe(userId)

    await caller.tags.unassign({ taskId, tagId })
    const after = await db.select().from(taskTags).where(eq(taskTags.tagId, tagId))
    expect(after).toHaveLength(0)
  })

  it("rejects assigning an unknown task or tag", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const taskId = await makeTask(userId)
    const tagId = await caller.tags.create({ name: "Real", color: "blue" })

    await expect(caller.tags.assign({ taskId, tagId: randomUUID() })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(caller.tags.assign({ taskId: randomUUID(), tagId })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("won't cross users — foreign task or tag is rejected and nothing is linked", async () => {
    const a = await makeUser()
    const b = await makeUser()
    const aTask = await makeTask(a)
    const bTag = await appRouter.createCaller({ db, userId: b }).tags.create({
      name: "B tag",
      color: "green",
    })
    // b's tag with a's task, called as a → a doesn't own the tag.
    await expect(
      appRouter.createCaller({ db, userId: a }).tags.assign({ taskId: aTask, tagId: bTag }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    const links = await db.select().from(taskTags)
    expect(links).toHaveLength(0)
  })
})

describe("tags.softDelete", () => {
  it("tombstones the tag and hard-deletes its links", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const taskId = await makeTask(userId)
    const tagId = await caller.tags.create({ name: "Temp", color: "blue" })
    await caller.tags.assign({ taskId, tagId })

    await caller.tags.softDelete({ id: tagId })

    const [row] = await db.select().from(tags).where(eq(tags.id, tagId))
    expect(row?.deletedAt).not.toBeNull() // tag tombstoned, not row-deleted
    const links = await db.select().from(taskTags).where(eq(taskTags.tagId, tagId))
    expect(links).toHaveLength(0) // links have no independent lifecycle → gone
  })

  it("is idempotent-safe and scoped: deleting an already-tombstoned or foreign tag throws", async () => {
    const owner = await makeUser()
    const other = await makeUser()
    const caller = appRouter.createCaller({ db, userId: owner })
    const tagId = await caller.tags.create({ name: "Once", color: "amber" })
    await caller.tags.softDelete({ id: tagId })
    await expect(caller.tags.softDelete({ id: tagId })).rejects.toMatchObject({ code: "NOT_FOUND" })
    await expect(
      appRouter.createCaller({ db, userId: other }).tags.softDelete({ id: tagId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})

describe("tags.reorder", () => {
  it("writes positions by array order, scoped to the user", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const a = await caller.tags.create({ name: "A", color: "blue", position: 0 })
    const b = await caller.tags.create({ name: "B", color: "green", position: 1 })
    await caller.tags.reorder({ ids: [b, a] })
    const rows = await db
      .select({ id: tags.id, position: tags.position })
      .from(tags)
      .where(and(eq(tags.userId, userId), isNull(tags.deletedAt)))
    const pos = new Map(rows.map((r) => [r.id, r.position]))
    expect(pos.get(b)).toBe(0)
    expect(pos.get(a)).toBe(1)
  })
})
