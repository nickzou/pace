import { dueDayState } from "./dates"

// The multi-facet task filter (P2-04). Values OR *within* a facet, facets AND *across* —
// the predictable Linear/GitHub model. Tags add an any/all include mode plus an exclude
// (none-of) facet. Held in the URL so it's deep-linkable and survives reload. Text search
// stays separate (applied by the list).
export type TagsMode = "any" | "all"

// Presentation mode (P2-07) — how the same tasks are displayed. Orthogonal to the filters
// below: `view` is a DATE facet, `layout` is how the filtered set is rendered.
export type Layout = "list" | "table" | "calendar" | "board"
export const LAYOUTS: Layout[] = ["list", "table", "calendar", "board"]
export const DEFAULT_LAYOUT: Layout = "list"
export function isLayout(v: unknown): v is Layout {
  return typeof v === "string" && (LAYOUTS as string[]).includes(v)
}

export type Filters = {
  layout?: Layout // presentation mode (P2-07); not a filter — ignored by matchesFilters
  view?: "today" | "upcoming" | "overdue" | "all" // date facet
  status?: string[] // any-of status ids
  tags?: string[] // include tag ids
  tagsMode?: TagsMode // "any" (default) = has any; "all" = has every
  notTags?: string[] // exclude tag ids
}

// The minimal task shape the predicate reads.
type FilterableTask = {
  due_date: string | null
  status_id: string
  status_category: string
}

export function matchesFilters(t: FilterableTask, tags: { id: string }[], f: Filters): boolean {
  if (
    f.view &&
    f.view !== "all" &&
    dueDayState(t.due_date, t.status_category === "done") !== f.view
  ) {
    return false
  }
  if (f.status?.length && !f.status.includes(t.status_id)) return false
  if (f.tags?.length) {
    const ids = new Set(tags.map((tag) => tag.id))
    const ok =
      f.tagsMode === "all" ? f.tags.every((id) => ids.has(id)) : f.tags.some((id) => ids.has(id))
    if (!ok) return false
  }
  if (f.notTags?.length && tags.some((tag) => f.notTags?.includes(tag.id))) return false
  return true
}

// True when any facet is active — used to decide whether to show a "Clear all".
export function hasActiveFilters(f: Filters): boolean {
  return Boolean(
    (f.view && f.view !== "all") || f.status?.length || f.tags?.length || f.notTags?.length,
  )
}
