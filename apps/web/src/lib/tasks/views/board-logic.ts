import type { StatusOption } from "../status-control"

// Pure board-column logic (P2-07), split out of board-view so the ordering rules — especially the
// category-band clamp — are unit-testable without dnd-kit or a DOM.

// Columns read left→right as a workflow: open → in-progress → done. Within a category we keep the
// user's status `position` order (the query already sorts by it, and Array.sort is stable).
export const CATEGORY_RANK: Record<string, number> = { open: 0, in_progress: 1, done: 2 }

// Order a group's statuses into board columns: by category band, position-stable within a band.
export function sortColumnsByCategory<T extends { category: string }>(cols: T[]): T[] {
  return [...cols].sort(
    (a, b) => (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9),
  )
}

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

// The new column id order after dragging `fromId` onto `toId`, or null if the move is a no-op or
// would cross a category band (category is immutable, so a column can only reorder within its band).
export function reorderColumns(
  columns: Pick<StatusOption, "id" | "category">[],
  fromId: string,
  toId: string,
): string[] | null {
  if (fromId === toId) return null
  const from = columns.find((c) => c.id === fromId)
  const to = columns.find((c) => c.id === toId)
  if (!from || !to || from.category !== to.category) return null
  const ids = columns.map((c) => c.id)
  return arrayMove(ids, ids.indexOf(fromId), ids.indexOf(toId))
}
