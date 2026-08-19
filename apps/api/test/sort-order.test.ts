import { describe, expect, it } from "vitest"
import { type BackfillRow, planBackfill } from "../src/db/sort-order"

// P2-06 backfill key-assignment (pure — no DB). The caller feeds un-keyed rows already ordered by
// (user, parent, created_at DESC, id); planBackfill mints spaced fractional keys per sibling scope.

const row = (id: string, userId: string, parentId: string | null): BackfillRow => ({
  id,
  userId,
  parentId,
})

describe("planBackfill", () => {
  it("keys every row exactly once", () => {
    const rows = [row("a", "u1", null), row("b", "u1", null), row("c", "u1", null)]
    const plan = planBackfill(rows)
    expect(plan.map((p) => p.id).sort()).toEqual(["a", "b", "c"])
    expect(new Set(plan.map((p) => p.sortOrder)).size).toBe(3) // distinct keys
  })

  it("assigns ascending keys in feed order, so ORDER BY sort_order reproduces it", () => {
    // Fed newest-first (created_at DESC); the first row must get the smallest key.
    const rows = [row("newest", "u1", null), row("mid", "u1", null), row("oldest", "u1", null)]
    const plan = planBackfill(rows)
    const byId = new Map(plan.map((p) => [p.id, p.sortOrder]))
    const newest = byId.get("newest")
    const mid = byId.get("mid")
    const oldest = byId.get("oldest")
    if (!newest || !mid || !oldest) throw new Error("missing key")
    expect(newest < mid).toBe(true)
    expect(mid < oldest).toBe(true)
  })

  it("keys each sibling scope independently (per user, per parent)", () => {
    const rows = [
      // u1 top-level
      row("u1a", "u1", null),
      row("u1b", "u1", null),
      // u1 subtasks of p1
      row("u1p1a", "u1", "p1"),
      row("u1p1b", "u1", "p1"),
      // u2 top-level
      row("u2a", "u2", null),
    ]
    const plan = planBackfill(rows)
    const byId = new Map(plan.map((p) => [p.id, p.sortOrder]))
    // Every row keyed.
    expect(plan).toHaveLength(5)
    // Each scope's first row starts fresh at the same smallest key (scopes are independent).
    expect(byId.get("u1a")).toBe(byId.get("u1p1a"))
    expect(byId.get("u1a")).toBe(byId.get("u2a"))
    // Within a scope, keys ascend.
    const u1a = byId.get("u1a")
    const u1b = byId.get("u1b")
    if (!u1a || !u1b) throw new Error("missing key")
    expect(u1a < u1b).toBe(true)
  })

  it("handles an empty input", () => {
    expect(planBackfill([])).toEqual([])
  })
})
