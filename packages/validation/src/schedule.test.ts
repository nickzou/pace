import { describe, expect, it } from "vitest"
import { resolveScheduleRange } from "./schedule"

describe("resolveScheduleRange", () => {
  it("a single picked day is a lone due date, no start", () => {
    expect(resolveScheduleRange("2026-09-16", "")).toEqual({ start: "", due: "2026-09-16" })
    // a lone `to` (defensive — pickers give `from` first) still reads as the single due
    expect(resolveScheduleRange("", "2026-09-16")).toEqual({ start: "", due: "2026-09-16" })
  })

  it("the same day twice collapses to a single due date", () => {
    expect(resolveScheduleRange("2026-09-16", "2026-09-16")).toEqual({
      start: "",
      due: "2026-09-16",
    })
  })

  it("two distinct days form a start→due range with the earlier end as start", () => {
    expect(resolveScheduleRange("2026-09-10", "2026-09-20")).toEqual({
      start: "2026-09-10",
      due: "2026-09-20",
    })
  })

  it("orders the ends regardless of argument order", () => {
    expect(resolveScheduleRange("2026-09-20", "2026-09-10")).toEqual({
      start: "2026-09-10",
      due: "2026-09-20",
    })
  })

  it("clears the schedule when both ends are empty", () => {
    expect(resolveScheduleRange("", "")).toEqual({ start: "", due: "" })
  })
})
