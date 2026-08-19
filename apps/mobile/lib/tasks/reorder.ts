import type { AbstractPowerSyncDatabase } from "@powersync/react-native"
import { useEffect, useState } from "react"
import { reorderItems } from "react-native-reorderable-list"
import { keyBetween, setTaskOrder } from "./order"

// Mobile drag-to-reorder plumbing (P2-06) — the twin of web's useOptimisticOrder. react-native-
// reorderable-list handles the gesture/animation; on drop it hands us {from, to} indices. We
// compute the moved row's new fractional key from its neighbours in the reordered list, write
// only that row's sort_order to local SQLite (replays as tasks.update), and render an optimistic
// copy so the row doesn't snap back while the write + reactive query round-trip.

type Orderable = { id: string; sort_order: string }

export function useReorder<T extends Orderable>(
  db: AbstractPowerSyncDatabase,
  dbItems: T[],
): { items: T[]; onReorder: (e: { from: number; to: number }) => void } {
  const [optimistic, setOptimistic] = useState<T[] | null>(null)

  useEffect(() => {
    setOptimistic((cur) => {
      if (!cur) return null
      const dbSig = dbItems.map((t) => t.id).join(",")
      const curSig = cur.map((t) => t.id).join(",")
      // Same rows, same order → the write landed; hand control back to the query. A changed set
      // of rows (add/remove/sync) → drop the override rather than render a stale order.
      const sameSet =
        dbItems.length === cur.length && dbItems.every((t) => cur.some((c) => c.id === t.id))
      return curSig === dbSig || !sameSet ? null : cur
    })
  }, [dbItems])

  const items = optimistic ?? dbItems

  const onReorder = ({ from, to }: { from: number; to: number }) => {
    if (from === to) return
    const reordered = reorderItems(items, from, to)
    const moved = reordered[to]
    if (!moved) return
    const prev = reordered[to - 1]?.sort_order ?? null
    const next = reordered[to + 1]?.sort_order ?? null
    try {
      const key = keyBetween(prev, next)
      setOptimistic(reordered)
      void setTaskOrder(db, moved.id, key)
    } catch {
      // Neighbours share a key (a rare offline collision) — no gap to insert into. Skip; the
      // next drag, against re-synced keys, resolves it.
    }
  }

  return { items, onReorder }
}
