import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { describe, expect, it, vi } from "vitest"
import { reorderStatuses } from "./mutations"

// reorderStatuses renumbers a group's statuses to position = index (the board column drag and the
// settings drag both write through it). We assert the SQL it emits against a fake db, no PowerSync.

describe("reorderStatuses", () => {
  it("writes position = index for each id, in order", async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    const db = { execute } as unknown as AbstractPowerSyncDatabase

    await reorderStatuses(db, ["a", "b", "c"])

    expect(execute).toHaveBeenCalledTimes(3)
    for (const [i, id] of ["a", "b", "c"].entries()) {
      const [sql, params] = execute.mock.calls[i] as [string, unknown[]]
      expect(sql).toContain("UPDATE statuses SET position")
      expect(params[0]).toBe(i) // position
      expect(params[2]).toBe(id) // WHERE id
    }
  })

  it("does nothing for an empty order", async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    await reorderStatuses({ execute } as unknown as AbstractPowerSyncDatabase, [])
    expect(execute).not.toHaveBeenCalled()
  })
})
