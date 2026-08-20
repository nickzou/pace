import { describe, expect, it } from "vitest"
import { reorderColumns, sortColumnsByCategory } from "./board-logic"

// The board columns are a status group ordered into open → in-progress → done bands, and a column
// drag may only reorder WITHIN its band (category is immutable). Both rules are pure.

const cols = [
  { id: "todo", category: "open" },
  { id: "doing", category: "in_progress" },
  { id: "review", category: "in_progress" },
  { id: "done", category: "done" },
]

describe("sortColumnsByCategory", () => {
  it("orders by band and is stable within a band", () => {
    const shuffled = [
      { id: "done", category: "done" },
      { id: "review", category: "in_progress" },
      { id: "todo", category: "open" },
      { id: "doing", category: "in_progress" },
    ]
    // in_progress keeps input order (review before doing) — stable within the band.
    expect(sortColumnsByCategory(shuffled).map((c) => c.id)).toEqual([
      "todo",
      "review",
      "doing",
      "done",
    ])
  })

  it("sinks an unknown category to the end", () => {
    const withOdd = [{ id: "weird", category: "archived" }, ...cols]
    expect(
      sortColumnsByCategory(withOdd)
        .map((c) => c.id)
        .at(-1),
    ).toBe("weird")
  })

  it("does not mutate the input array", () => {
    const input = [...cols]
    sortColumnsByCategory(input)
    expect(input.map((c) => c.id)).toEqual(["todo", "doing", "review", "done"])
  })
})

describe("reorderColumns", () => {
  it("reorders two columns inside the same band", () => {
    expect(reorderColumns(cols, "doing", "review")).toEqual(["todo", "review", "doing", "done"])
  })

  it("refuses a move across category bands", () => {
    expect(reorderColumns(cols, "todo", "done")).toBeNull()
    expect(reorderColumns(cols, "done", "doing")).toBeNull()
  })

  it("is a no-op when dropped on itself", () => {
    expect(reorderColumns(cols, "doing", "doing")).toBeNull()
  })

  it("returns null for unknown ids", () => {
    expect(reorderColumns(cols, "ghost", "todo")).toBeNull()
    expect(reorderColumns(cols, "todo", "ghost")).toBeNull()
  })
})
