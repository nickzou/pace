import { dueDayState } from "./dates"

// The multi-facet task filter (P2-04) — the mobile twin of apps/web's tasks/filter.ts.
// Values OR within a facet, facets AND across. Tags add an any/all include mode plus an
// exclude facet. Text search stays separate (applied by the list).
export type TagsMode = "any" | "all"

export type Filters = {
  view?: "today" | "upcoming" | "overdue" | "all"
  status?: string[]
  tags?: string[]
  tagsMode?: TagsMode
  notTags?: string[]
}

// Presentation layout (P2-07 · Multiview). The mobile subset — no table (that stays web-only,
// decision 4). Held in component state (no URL on native; session-only, decision).
export type Layout = "list" | "calendar" | "board"
export const LAYOUTS: Layout[] = ["list", "calendar", "board"]
export const DEFAULT_LAYOUT: Layout = "list"

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

export function hasActiveFilters(f: Filters): boolean {
  return Boolean(
    (f.view && f.view !== "all") || f.status?.length || f.tags?.length || f.notTags?.length,
  )
}
