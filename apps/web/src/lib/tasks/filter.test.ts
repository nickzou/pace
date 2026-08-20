import { describe, expect, it } from "vitest"
import {
  DEFAULT_LAYOUT,
  type Filters,
  hasActiveFilters,
  isLayout,
  LAYOUTS,
  matchesFilters,
} from "./filter"

// P2-04 filter semantics: values OR *within* a facet, facets AND *across*. Tags add an
// any/all include mode plus an exclude (none-of) facet. These are the rules the list and
// the sidebar counts both lean on, so they get a pure-function test independent of the UI.

// A task carrying only the fields the predicate reads. Due date is relative so the `view`
// facet (which compares against "today") is deterministic regardless of when this runs.
const daysFromNow = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}
const task = (over: Partial<Parameters<typeof matchesFilters>[0]> = {}) => ({
  due_date: null,
  status_id: "s-open",
  status_category: "open",
  ...over,
})
const tag = (id: string) => ({ id })

describe("matchesFilters — no active facets", () => {
  it("matches every task when the filter is empty", () => {
    expect(matchesFilters(task(), [], {})).toBe(true)
    expect(matchesFilters(task({ due_date: daysFromNow(-3) }), [tag("a")], {})).toBe(true)
  })

  it("treats view 'all' as no date facet", () => {
    expect(matchesFilters(task({ due_date: daysFromNow(5) }), [], { view: "all" })).toBe(true)
  })
})

describe("matchesFilters — status facet (any-of)", () => {
  it("keeps a task whose status is in the set, drops one that isn't", () => {
    const f: Filters = { status: ["s-open", "s-doing"] }
    expect(matchesFilters(task({ status_id: "s-doing" }), [], f)).toBe(true)
    expect(matchesFilters(task({ status_id: "s-done" }), [], f)).toBe(false)
  })
})

describe("matchesFilters — tags include", () => {
  const tags = [tag("a"), tag("b")]

  it("any (default): matches when the task has at least one of the include tags", () => {
    expect(matchesFilters(task(), tags, { tags: ["a"] })).toBe(true)
    expect(matchesFilters(task(), tags, { tags: ["a", "z"] })).toBe(true)
    expect(matchesFilters(task(), tags, { tags: ["z"] })).toBe(false)
    expect(matchesFilters(task(), [], { tags: ["a"] })).toBe(false)
  })

  it("all: matches only when the task has every include tag", () => {
    expect(matchesFilters(task(), tags, { tags: ["a", "b"], tagsMode: "all" })).toBe(true)
    expect(matchesFilters(task(), tags, { tags: ["a", "z"], tagsMode: "all" })).toBe(false)
  })
})

describe("matchesFilters — tags exclude (none-of)", () => {
  it("drops a task carrying any excluded tag, keeps one that carries none", () => {
    expect(matchesFilters(task(), [tag("a"), tag("b")], { notTags: ["b"] })).toBe(false)
    expect(matchesFilters(task(), [tag("a")], { notTags: ["b", "c"] })).toBe(true)
    expect(matchesFilters(task(), [], { notTags: ["b"] })).toBe(true)
  })
})

describe("matchesFilters — date view facet", () => {
  it("classifies by local calendar day", () => {
    expect(matchesFilters(task({ due_date: daysFromNow(0) }), [], { view: "today" })).toBe(true)
    expect(matchesFilters(task({ due_date: daysFromNow(2) }), [], { view: "upcoming" })).toBe(true)
    expect(matchesFilters(task({ due_date: daysFromNow(-1) }), [], { view: "overdue" })).toBe(true)
    expect(matchesFilters(task({ due_date: daysFromNow(-1) }), [], { view: "today" })).toBe(false)
  })

  it("a done task carries no urgency, so it never matches a date view", () => {
    const done = task({ due_date: daysFromNow(-1), status_category: "done" })
    expect(matchesFilters(done, [], { view: "overdue" })).toBe(false)
  })

  it("a task with no due date never matches a date view", () => {
    expect(matchesFilters(task({ due_date: null }), [], { view: "today" })).toBe(false)
  })
})

describe("matchesFilters — facets AND across", () => {
  it("requires every active facet to pass", () => {
    const tags = [tag("a")]
    const f: Filters = { status: ["s-open"], tags: ["a"] }
    // status ok + tag ok → in
    expect(matchesFilters(task({ status_id: "s-open" }), tags, f)).toBe(true)
    // status fails though tag ok → out
    expect(matchesFilters(task({ status_id: "s-done" }), tags, f)).toBe(false)
    // status ok but tag fails → out
    expect(matchesFilters(task({ status_id: "s-open" }), [], f)).toBe(false)
  })

  it("include and exclude combine — has A but not B", () => {
    const f: Filters = { tags: ["a"], notTags: ["b"] }
    expect(matchesFilters(task(), [tag("a")], f)).toBe(true)
    expect(matchesFilters(task(), [tag("a"), tag("b")], f)).toBe(false)
  })
})

describe("hasActiveFilters", () => {
  it("is false for an empty filter or an explicit view 'all'", () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ view: "all" })).toBe(false)
    expect(hasActiveFilters({ status: [], tags: [], notTags: [] })).toBe(false)
  })

  it("is true when any facet carries a value", () => {
    expect(hasActiveFilters({ view: "today" })).toBe(true)
    expect(hasActiveFilters({ status: ["s"] })).toBe(true)
    expect(hasActiveFilters({ tags: ["a"] })).toBe(true)
    expect(hasActiveFilters({ notTags: ["b"] })).toBe(true)
  })
})

// The presentation layout (P2-07) rides on Filters but is orthogonal to the data facets: it never
// filters tasks and never counts as an "active filter" (so it doesn't flatten the list).
describe("isLayout", () => {
  it("accepts exactly the four known layouts", () => {
    for (const l of LAYOUTS) expect(isLayout(l)).toBe(true)
    expect(DEFAULT_LAYOUT).toBe("list")
  })

  it("rejects unknown / non-string values", () => {
    for (const v of ["kanban", "", "List", undefined, null, 3, {}]) expect(isLayout(v)).toBe(false)
  })
})

describe("layout is orthogonal to filtering", () => {
  it("does not affect matchesFilters", () => {
    const t = { due_date: null, status_id: "s", status_category: "open" }
    expect(matchesFilters(t, [], { layout: "board" })).toBe(true)
    expect(matchesFilters(t, [], { status: ["other"], layout: "board" })).toBe(
      matchesFilters(t, [], { status: ["other"] }),
    )
  })

  it("a layout alone is not an active filter", () => {
    expect(hasActiveFilters({ layout: "table" })).toBe(false)
    expect(hasActiveFilters({ layout: "board", view: "all" })).toBe(false)
  })
})
