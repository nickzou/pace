import { randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { db } from "../src/db"
import { user } from "../src/db/auth"
import { seedUserStatuses } from "../src/db/seed"
import { statuses, statusGroups, userSettings } from "../src/db/statuses"
import { tasks } from "../src/db/tasks"
import { appRouter } from "../src/trpc/router"

// P2-05 · subtask hierarchy. A subtask is a task with parent_id; the router enforces a
// depth cap (5), no self/cycle, and a recursive cascade on delete. These are the invariants
// worth pinning — the rest of a subtask reuses the existing task path unchanged.

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

// Build a parent→child chain n levels deep; returns ids top-first.
async function chain(caller: ReturnType<typeof appRouter.createCaller>, n: number, tag = "L") {
  const ids: string[] = []
  let parentId: string | null = null
  for (let i = 0; i < n; i++) {
    const t = await caller.tasks.create({ title: `${tag}${i}`, ...(parentId ? { parentId } : {}) })
    ids.push(t.id)
    parentId = t.id
  }
  return ids
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

describe("tasks.create — subtasks", () => {
  it("creates a subtask under a live parent", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const parent = await caller.tasks.create({ title: "Parent" })
    const child = await caller.tasks.create({ title: "Child", parentId: parent.id })
    expect(child.parentId).toBe(parent.id)
    const top = await caller.tasks.list()
    expect(top.find((t) => t.id === child.id)?.parentId).toBe(parent.id)
  })

  it("rejects a subtask under an unknown / foreign parent", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    await expect(
      caller.tasks.create({ title: "Orphan", parentId: randomUUID() }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    // another user's task is not a valid parent (owner-scoped guard)
    const other = appRouter.createCaller({ db, userId: await makeUser() })
    const foreign = await other.tasks.create({ title: "Theirs" })
    await expect(caller.tasks.create({ title: "X", parentId: foreign.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("allows nesting up to 5 levels but rejects a 6th", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const ids = await chain(caller, 5) // levels 1..5 — all valid
    expect(ids).toHaveLength(5)
    await expect(caller.tasks.create({ title: "L6", parentId: ids[4] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })
})

describe("tasks.setParent", () => {
  it("moves a task under a new parent", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const a = await caller.tasks.create({ title: "A" })
    const b = await caller.tasks.create({ title: "B" })
    const moved = await caller.tasks.setParent({ id: b.id, parentId: a.id })
    expect(moved.parentId).toBe(a.id)
  })

  it("promotes a subtask back to top-level with parentId null", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const [top, child] = await chain(caller, 2)
    const promoted = await caller.tasks.setParent({ id: child as string, parentId: null })
    expect(promoted.parentId).toBeNull()
    expect(top).toBeTruthy()
  })

  it("rejects self-parent and cycles", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const [a, , c] = await chain(caller, 3) // a > b > c
    await expect(
      caller.tasks.setParent({ id: a as string, parentId: a as string }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    // a under its own descendant c → cycle
    await expect(
      caller.tasks.setParent({ id: a as string, parentId: c as string }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
  })

  it("checks the moved subtree's height against the cap, not just the node", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const sub = await chain(caller, 3, "S") // a height-3 subtree, top = sub[0]
    const deep = await chain(caller, 3, "D") // depth-3 chain, deepest = deep[2]
    // depth(deep[2]) = 3 + height(sub) = 3 → 6 > 5, reject
    await expect(
      caller.tasks.setParent({ id: sub[0] as string, parentId: deep[2] as string }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    // under deep[1] (depth 2) → 2 + 3 = 5, allowed
    const ok = await caller.tasks.setParent({ id: sub[0] as string, parentId: deep[1] as string })
    expect(ok.parentId).toBe(deep[1])
  })
})

describe("tasks.softDelete — cascade", () => {
  it("tombstones the whole subtree, not just the target", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const parent = await caller.tasks.create({ title: "P" })
    const c1 = await caller.tasks.create({ title: "C1", parentId: parent.id })
    const c2 = await caller.tasks.create({ title: "C2", parentId: parent.id })
    const g1 = await caller.tasks.create({ title: "G1", parentId: c1.id })

    await caller.tasks.softDelete({ id: parent.id })

    // none of the subtree survives a list (which excludes tombstones)
    const live = await caller.tasks.list()
    expect(live).toHaveLength(0)
    // and all four rows carry a deletedAt
    const remaining = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    expect(remaining).toHaveLength(0)
    for (const id of [parent.id, c1.id, c2.id, g1.id]) {
      const [row] = await db.select().from(tasks).where(eq(tasks.id, id))
      expect(row?.deletedAt).not.toBeNull()
    }
  })

  it("deleting a subtask leaves its parent and siblings alone", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const parent = await caller.tasks.create({ title: "P" })
    const c1 = await caller.tasks.create({ title: "C1", parentId: parent.id })
    const c2 = await caller.tasks.create({ title: "C2", parentId: parent.id })
    await caller.tasks.softDelete({ id: c1.id })
    const live = await caller.tasks.list()
    expect(live.map((t) => t.id).sort()).toEqual([parent.id, c2.id].sort())
  })

  it("undo re-creates a soft-deleted subtree, restoring each row's parent (upsert path)", async () => {
    const userId = await makeUser()
    const caller = appRouter.createCaller({ db, userId })
    const parent = await caller.tasks.create({ title: "P" })
    const child = await caller.tasks.create({ title: "C", parentId: parent.id })
    await caller.tasks.softDelete({ id: parent.id }) // cascades to child

    // Undo replays as create (top-down): re-create parent then child with their captured ids
    // + parentId. The upsert clears deletedAt and restores the link.
    await caller.tasks.create({ id: parent.id, title: "P", parentId: null })
    await caller.tasks.create({ id: child.id, title: "C", parentId: parent.id })

    const live = await caller.tasks.list()
    expect(live.map((t) => t.id).sort()).toEqual([parent.id, child.id].sort())
    expect(live.find((t) => t.id === child.id)?.parentId).toBe(parent.id)
  })
})

describe("tasks.setParent — deeper moves & scoping", () => {
  it("allows re-parenting under a non-top-level task when within the cap", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const [, b] = await chain(caller, 2) // a > b  (b is at level 2)
    const loose = await caller.tasks.create({ title: "loose" })
    // loose (height 1) under b (depth 2) → 2 + 1 = 3 ≤ 5, allowed → loose becomes level 3
    const moved = await caller.tasks.setParent({ id: loose.id, parentId: b as string })
    expect(moved.parentId).toBe(b)
  })

  it("won't re-parent, or cascade-delete across, another user's tasks", async () => {
    const a = await makeUser()
    const bId = await makeUser()
    const aCaller = appRouter.createCaller({ db, userId: a })
    const bCaller = appRouter.createCaller({ db, userId: bId })
    const aParent = await aCaller.tasks.create({ title: "A parent" })
    const aChild = await aCaller.tasks.create({ title: "A child", parentId: aParent.id })

    // b can't move a's task, and can't delete a's tree.
    await expect(bCaller.tasks.setParent({ id: aChild.id, parentId: null })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    await expect(bCaller.tasks.softDelete({ id: aParent.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
    // a's tree is untouched.
    expect((await aCaller.tasks.list()).map((t) => t.id).sort()).toEqual(
      [aParent.id, aChild.id].sort(),
    )
  })
})
