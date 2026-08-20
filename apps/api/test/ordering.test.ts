import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { db } from "../src/db"
import { user } from "../src/db/auth"
import { seedUserStatuses } from "../src/db/seed"
import { statuses, statusGroups, userSettings } from "../src/db/statuses"
import { tasks } from "../src/db/tasks"
import { appRouter } from "../src/trpc/router"

// P2-06 · manual ordering. Tasks carry a fractional sort key; the router assigns a
// bottom-of-scope key on create, carries it on update (a reorder), and re-stamps it on
// re-parent. list() reads `ORDER BY sort_order, id`. These are the ordering invariants.

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

beforeEach(clean)
afterEach(clean)

describe("tasks.create — sort key", () => {
  it("assigns each new top-level task a bottom-of-scope key (append order)", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const a = await caller.tasks.create({ title: "A" })
    const b = await caller.tasks.create({ title: "B" })
    const c = await caller.tasks.create({ title: "C" })
    // Non-empty, distinct, and strictly increasing — B after A, C after B.
    expect(a.sortOrder).not.toBe("")
    expect(a.sortOrder < b.sortOrder).toBe(true)
    expect(b.sortOrder < c.sortOrder).toBe(true)
    // list() reflects that order.
    const list = await caller.tasks.list()
    expect(list.map((t) => t.title)).toEqual(["A", "B", "C"])
  })

  it("honours a client-minted sort key (offline creates)", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const t = await caller.tasks.create({ title: "Keyed", sortOrder: "a5" })
    expect(t.sortOrder).toBe("a5")
  })

  it("keys subtasks in their own parent scope, independent of top-level", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const parent = await caller.tasks.create({ title: "Parent" })
    const c1 = await caller.tasks.create({ title: "C1", parentId: parent.id })
    const c2 = await caller.tasks.create({ title: "C2", parentId: parent.id })
    // Children order among themselves (C1 before C2); each scope starts fresh.
    expect(c1.sortOrder < c2.sortOrder).toBe(true)
  })
})

describe("tasks.update — reorder", () => {
  it("carries a new sort key, and list() re-sorts by it", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const a = await caller.tasks.create({ title: "A" })
    await caller.tasks.create({ title: "B" })
    const c = await caller.tasks.create({ title: "C" })
    // Move A to the end: give it a key after C.
    const moved = await caller.tasks.update({ id: a.id, sortOrder: `${c.sortOrder}0` })
    expect(moved.sortOrder).toBe(`${c.sortOrder}0`)
    const list = await caller.tasks.list()
    expect(list.map((t) => t.title)).toEqual(["B", "C", "A"])
  })
})

describe("tasks.setParent — re-stamp", () => {
  it("re-keys a re-parented task to the bottom of its new scope", async () => {
    const caller = appRouter.createCaller({ db, userId: await makeUser() })
    const parent = await caller.tasks.create({ title: "Parent" })
    const c1 = await caller.tasks.create({ title: "C1", parentId: parent.id })
    const c2 = await caller.tasks.create({ title: "C2", parentId: parent.id })
    const mover = await caller.tasks.create({ title: "Mover" })
    const moved = await caller.tasks.setParent({ id: mover.id, parentId: parent.id })
    // Now a child of the parent, re-keyed to the bottom of that scope: it sorts after both
    // existing children (its old top-level key was meaningless in the new scope).
    expect(moved.parentId).toBe(parent.id)
    expect(c1.sortOrder < moved.sortOrder).toBe(true)
    expect(c2.sortOrder < moved.sortOrder).toBe(true)
    // The parent's children now read C1, C2, Mover in order.
    const list = await caller.tasks.list()
    const kids = list.filter((t) => t.parentId === parent.id).map((t) => t.title)
    expect(kids).toEqual(["C1", "C2", "Mover"])
  })
})
