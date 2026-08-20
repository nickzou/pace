import type { AbstractPowerSyncDatabase } from "@powersync/react-native"
import { generateKeyBetween } from "fractional-indexing"

// Manual ordering (P2-06) — the mobile twin of apps/web's tasks/order.ts (same key math,
// different PowerSync SDK). The one place the fractional-key library is called, so the two
// surfaces can't drift.
//
// A task's order is a fractional sort key: tasks render `ORDER BY sort_order, id` within a
// sibling scope (parent_id). Moving a task rewrites ONLY its own key to a value between its
// new neighbours — O(1), and two devices moving different tasks always converge.

// A key that sorts strictly between a and b. Either bound may be null: (null, first) = the
// very top, (last, null) = the very bottom, (null, null) = the first key in an empty list.
// Throws if a >= b (equal or inverted bounds) — callers pass a real gap, so this only fires
// on a rare offline key collision; the drag handler treats a throw as a no-op.
export function keyBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b)
}

// The bottom-of-scope key for a brand-new task/subtask: sorts after every current sibling, so
// new tasks append to the end of their list (the P2-06 decision). The local DB mirrors only
// live rows (tombstones fall out of sync), so "every sibling" needs no deleted_at filter.
export async function bottomOfScopeKey(
  db: AbstractPowerSyncDatabase,
  parentId: string | null,
): Promise<string> {
  const rows = await db.getAll<{ sort_order: string }>(
    parentId === null
      ? "SELECT sort_order FROM tasks WHERE parent_id IS NULL ORDER BY sort_order DESC, id DESC LIMIT 1"
      : "SELECT sort_order FROM tasks WHERE parent_id = ? ORDER BY sort_order DESC, id DESC LIMIT 1",
    parentId === null ? [] : [parentId],
  )
  const max = rows[0]?.sort_order || null
  return keyBetween(max, null)
}

// Reorder a task: write ONLY sort_order (isolated), so the connector routes it to the generic
// `update` (which carries sortOrder) rather than the guarded setParent. The caller computes
// `key` from the drop's new neighbours via keyBetween().
export function setTaskOrder(db: AbstractPowerSyncDatabase, id: string, key: string) {
  return db.execute("UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?", [
    key,
    new Date().toISOString(),
    id,
  ])
}
