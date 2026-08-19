import { generateNKeysBetween } from "fractional-indexing"

// Pure key-assignment for the P2-06 backfill (extracted so it's unit-testable without a DB).
// Given the un-keyed tasks — already ordered by (user_id, parent_id, created_at DESC, id) — group
// them by sibling scope (user + parent) and mint evenly-spaced fractional keys per scope. Because
// the caller feeds rows newest-first, the smallest key goes to the newest task, so a later
// `ORDER BY sort_order` reproduces today's created_at DESC order.

export type BackfillRow = { id: string; userId: string; parentId: string | null }

export function planBackfill(rows: BackfillRow[]): { id: string; sortOrder: string }[] {
  // Group into scope-contiguous runs (rows arrive already grouped by user_id, parent_id).
  const scopes = new Map<string, BackfillRow[]>()
  for (const row of rows) {
    const key = `${row.userId}::${row.parentId ?? "root"}`
    const group = scopes.get(key)
    if (group) group.push(row)
    else scopes.set(key, [row])
  }

  const plan: { id: string; sortOrder: string }[] = []
  for (const group of scopes.values()) {
    const keys = generateNKeysBetween(null, null, group.length)
    for (let i = 0; i < group.length; i++) {
      const row = group[i]
      const sortOrder = keys[i]
      if (row && sortOrder !== undefined) plan.push({ id: row.id, sortOrder })
    }
  }
  return plan
}
