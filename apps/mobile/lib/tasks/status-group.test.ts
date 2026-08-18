import { describe, expect, it } from "vitest"
import { openStatusForGroup } from "./status-group"

const s = (id: string, group_id: string, category: string) => ({ id, group_id, category })

describe("openStatusForGroup", () => {
  it("returns the group's first open status in position order", () => {
    const statuses = [
      s("a", "g1", "in_progress"),
      s("b", "g1", "open"),
      s("c", "g1", "open"),
      s("d", "g2", "open"),
    ]
    expect(openStatusForGroup(statuses, "g1")?.id).toBe("b")
  })

  it("falls back to the group's first status when it has no open", () => {
    const statuses = [s("a", "g1", "done"), s("b", "g1", "in_progress")]
    expect(openStatusForGroup(statuses, "g1")?.id).toBe("a")
  })

  it("ignores statuses from other groups", () => {
    const statuses = [s("a", "g2", "open"), s("b", "g1", "in_progress")]
    expect(openStatusForGroup(statuses, "g1")?.id).toBe("b")
  })

  it("returns undefined for a group with no statuses", () => {
    expect(openStatusForGroup([s("a", "g2", "open")], "g1")).toBeUndefined()
  })
})
