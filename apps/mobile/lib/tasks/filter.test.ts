import { describe, expect, it } from "vitest"
import { type Filters, hasActiveFilters, matchesFilters } from "./filter"

// The mobile twin of apps/web's tasks/filter.test.ts — matchesFilters is byte-identical
// across surfaces, so its contract is pinned on both. P2-04 semantics: OR within a facet,
// AND across facets; tags add an any/all include mode plus an exclude (none-of) facet.

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
    expect(matchesFilters(task({ status_id: "s-open" }), tags, f)).toBe(true)
    expect(matchesFilters(task({ status_id: "s-done" }), tags, f)).toBe(false)
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
