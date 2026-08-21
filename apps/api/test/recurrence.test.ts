import { randomUUID } from "node:crypto"
import { withAnchor } from "@pace/validation/recurrence"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { db } from "../src/db"
import { user } from "../src/db/auth"
import { seedUserStatuses } from "../src/db/seed"
import { statuses, statusGroups, userSettings } from "../src/db/statuses"
import { tags, taskTags } from "../src/db/tags"
import { tasks } from "../src/db/tasks"
import { appRouter } from "../src/trpc/router"

// Server-side recurrence generation (P2-08 §5). user_settings.timezone is left null in the harness,
// so generation falls back to UTC — which makes a weekly step exactly +7 days, easy to assert.
const DUE = "2026-08-15T13:00:00.000Z"
const WEEK = 7 * 86_400_000
const weekly = () => withAnchor("FREQ=WEEKLY", DUE, "UTC")

async function makeUser(): Promise<string> {
  const id = randomUUID()
  const now = new Date()
  await db.insert(user).values({
    id,
    name: "T",
    email: `${id}@test.local`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  })
  await seedUserStatuses(id)
  return id
}
async function statusId(userId: string, category: "open" | "done"): Promise<string> {
  const [row] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(and(eq(statuses.userId, userId), eq(statuses.category, category)))
  if (!row) throw new Error(`no ${category} status`)
  return row.id
}
async function clean() {
  await db.delete(taskTags)
  await db.delete(tasks)
  await db.delete(tags)
  await db.delete(statuses)
  await db.delete(statusGroups)
  await db.delete(userSettings)
  await db.delete(user)
}
beforeEach(clean)
afterEach(clean)

describe("recurrence generation", () => {
  it("advance: completing reschedules and reopens the same task", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const t = await caller.tasks.create({ title: "gym", dueDate: DUE })
    await caller.tasks.setRecurrence({ id: t.id, recurrence: weekly(), recurrenceRegen: "advance" })

    const after = await caller.tasks.update({ id: t.id, statusId: await statusId(userId, "done") })
    expect(after.id).toBe(t.id) // same task
    expect(after.resolvedAt).toBeNull() // reopened
    expect(after.statusId).toBe(await statusId(userId, "open"))
    expect(new Date(after.dueDate ?? "").getTime() - new Date(DUE).getTime()).toBe(WEEK)
    expect(after.recurrence).toContain("FREQ=WEEKLY") // rule kept
    expect(await caller.tasks.list()).toHaveLength(1) // still one task
  })

  it("duplicate: completing keeps the done task (rule cleared) and mints the next with its tags", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const t = await caller.tasks.create({ title: "invoice", dueDate: DUE })
    const [tag] = await db.insert(tags).values({ userId, name: "work", color: "blue" }).returning()
    if (!tag) throw new Error("tag insert failed")
    await db.insert(taskTags).values({ id: randomUUID(), taskId: t.id, tagId: tag.id, userId })
    await caller.tasks.setRecurrence({
      id: t.id,
      recurrence: weekly(),
      recurrenceRegen: "duplicate",
    })

    const original = await caller.tasks.update({
      id: t.id,
      statusId: await statusId(userId, "done"),
    })
    expect(original.id).toBe(t.id)
    expect(original.resolvedAt).not.toBeNull() // stays done
    expect(original.recurrence).toBeNull() // finished instance — rule dropped

    const all = await caller.tasks.list()
    expect(all).toHaveLength(2)
    const fresh = all.find((x) => x.id !== t.id)
    if (!fresh) throw new Error("no fresh task minted")
    expect(fresh.recurrence).toContain("FREQ=WEEKLY")
    expect(fresh.recurrenceRegen).toBe("duplicate")
    expect(fresh.resolvedAt).toBeNull()
    expect(new Date(fresh.dueDate ?? "").getTime() - new Date(DUE).getTime()).toBe(WEEK)
    const carried = await db.select().from(taskTags).where(eq(taskTags.taskId, fresh.id))
    expect(carried).toHaveLength(1) // tag carried over
  })

  it("exhausted rule (COUNT reached): completion just stands", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const t = await caller.tasks.create({ title: "once", dueDate: DUE })
    await caller.tasks.setRecurrence({
      id: t.id,
      recurrence: withAnchor("FREQ=WEEKLY;COUNT=1", DUE, "UTC"),
      recurrenceRegen: "advance",
    })
    const after = await caller.tasks.update({ id: t.id, statusId: await statusId(userId, "done") })
    expect(after.resolvedAt).not.toBeNull() // stayed done, not reopened
    expect(await caller.tasks.list()).toHaveLength(1)
  })

  it("does not regenerate when the task was already done (non-done → done edge only)", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const t = await caller.tasks.create({ title: "x", dueDate: DUE })
    const done = await statusId(userId, "done")
    await caller.tasks.update({ id: t.id, statusId: done }) // done first, no rule
    await caller.tasks.setRecurrence({ id: t.id, recurrence: weekly(), recurrenceRegen: "advance" })
    await caller.tasks.update({ id: t.id, statusId: done }) // done → done: no edge, no fire
    expect(await caller.tasks.list()).toHaveLength(1)
  })

  describe("setRecurrence guards", () => {
    it("rejects a rule on a task with no due date", async () => {
      const userId = await makeUser()
      const caller = appRouter.createCaller({ db, userId })
      const t = await caller.tasks.create({ title: "no due" })
      await expect(
        caller.tasks.setRecurrence({ id: t.id, recurrence: weekly(), recurrenceRegen: "advance" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    })

    it("rejects an unparseable rule", async () => {
      const userId = await makeUser()
      const caller = appRouter.createCaller({ db, userId })
      const t = await caller.tasks.create({ title: "x", dueDate: DUE })
      await expect(
        caller.tasks.setRecurrence({
          id: t.id,
          recurrence: "nonsense",
          recurrenceRegen: "advance",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    })

    it("clears a rule with null", async () => {
      const userId = await makeUser()
      const caller = appRouter.createCaller({ db, userId })
      const t = await caller.tasks.create({ title: "x", dueDate: DUE })
      await caller.tasks.setRecurrence({
        id: t.id,
        recurrence: weekly(),
        recurrenceRegen: "advance",
      })
      const cleared = await caller.tasks.setRecurrence({
        id: t.id,
        recurrence: null,
        recurrenceRegen: null,
      })
      expect(cleared.recurrence).toBeNull()
    })
  })
})
