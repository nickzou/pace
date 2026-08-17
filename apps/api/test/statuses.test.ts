import { randomUUID } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { db } from "../src/db"
import { user } from "../src/db/auth"
import { seedUserStatuses } from "../src/db/seed"
import { statuses, statusGroups, userSettings } from "../src/db/statuses"
import { tasks } from "../src/db/tasks"
import { appRouter } from "../src/trpc/router"

// A real user row plus their seeded default group + To Do/Done statuses + settings row.
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

async function clean() {
  await db.delete(tasks)
  await db.delete(statuses)
  await db.delete(statusGroups)
  await db.delete(userSettings)
  await db.delete(user)
}

async function defaultGroupId(userId: string): Promise<string> {
  const [row] = await db
    .select({ id: statusGroups.id })
    .from(statusGroups)
    .where(and(eq(statusGroups.userId, userId), eq(statusGroups.isDefault, true)))
  if (!row) throw new Error("no default group seeded")
  return row.id
}

// The seeded (is_system) status of a category — To Do = open, Done = done.
async function seededStatus(userId: string, category: "open" | "done"): Promise<string> {
  const [row] = await db
    .select({ id: statuses.id })
    .from(statuses)
    .where(
      and(
        eq(statuses.userId, userId),
        eq(statuses.category, category),
        eq(statuses.isSystem, true),
      ),
    )
  if (!row) throw new Error(`no seeded ${category} status`)
  return row.id
}

beforeEach(clean)
afterEach(clean)

describe("statuses router", () => {
  it("creates a status list and a status inside it", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const groupId = await caller.statuses.groups.create({ name: "Sprint", position: 1 })
    const statusId = await caller.statuses.items.create({
      groupId,
      name: "In review",
      color: "amber",
      category: "in_progress",
      position: 0,
    })
    const [row] = await db.select().from(statuses).where(eq(statuses.id, statusId))
    expect(row?.groupId).toBe(groupId)
    expect(row?.category).toBe("in_progress")
    expect(row?.isSystem).toBe(false)
  })

  it("won't delete a seeded (system) status", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    await expect(
      caller.statuses.items.softDelete({ id: await seededStatus(userId, "done") }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("keeps every group with at least one open and one done status", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    // A fresh group with exactly one open + one done — both non-system.
    const groupId = await caller.statuses.groups.create({ name: "Kanban" })
    await caller.statuses.items.create({
      groupId,
      name: "Todo",
      color: "slate",
      category: "open",
    })
    const doneId = await caller.statuses.items.create({
      groupId,
      name: "Shipped",
      color: "green",
      category: "done",
    })
    await expect(caller.statuses.items.softDelete({ id: doneId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
  })

  it("reassigns a deleted status's tasks to a fallback and clears resolved_at", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const groupId = await defaultGroupId(userId)
    // A second open status in the default group; deleting it leaves To Do behind.
    const laterId = await caller.statuses.items.create({
      groupId,
      name: "Later",
      color: "blue",
      category: "open",
    })
    const t = await caller.tasks.create({ title: "x", statusId: laterId })
    expect(t.statusId).toBe(laterId)

    await caller.statuses.items.softDelete({ id: laterId })

    const [row] = await db.select().from(tasks).where(eq(tasks.id, t.id))
    expect(row?.statusId).toBe(await seededStatus(userId, "open")) // fell back to To Do
    expect(row?.resolvedAt).toBeNull()
    const [gone] = await db.select().from(statuses).where(eq(statuses.id, laterId))
    expect(gone?.deletedAt).not.toBeNull()
  })

  it("won't delete the default group", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    await expect(
      caller.statuses.groups.softDelete({ id: await defaultGroupId(userId) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  it("deleting a group tombstones it and moves its tasks to the default open status", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const groupId = await caller.statuses.groups.create({ name: "Temp" })
    const statusId = await caller.statuses.items.create({
      groupId,
      name: "Doing",
      color: "cyan",
      category: "in_progress",
    })
    const t = await caller.tasks.create({ title: "x", statusId })

    await caller.statuses.groups.softDelete({ id: groupId })

    const [task] = await db.select().from(tasks).where(eq(tasks.id, t.id))
    expect(task?.statusId).toBe(await seededStatus(userId, "open")) // default group's To Do
    const [group] = await db.select().from(statusGroups).where(eq(statusGroups.id, groupId))
    expect(group?.deletedAt).not.toBeNull()
  })

  it("rejects creating a status in a group the user doesn't own", async () => {
    const u1 = await makeUser()
    const u2 = await makeUser()
    const foreignGroup = await defaultGroupId(u2)
    await expect(
      appRouter.createCaller({ db, userId: u1 }).statuses.items.create({
        groupId: foreignGroup,
        name: "Sneaky",
        color: "red",
        category: "open",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  it("settings.set upserts the enable toggle", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    await caller.statuses.settings.set({ customStatusesEnabled: true })
    const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId))
    expect(row?.customStatusesEnabled).toBe(true)
  })
})
