import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import { keyBetween } from "./order"

// Web drag-and-drop for a manually-ordered task list (P2-06). dnd-kit is a thin UI layer over
// the fractional-key model: on drop we compute the moved row's new key from its neighbours in
// the reordered list and hand it to onMove, which writes only that one row's sort_order to local
// SQLite (the connector replays it as a tasks.update). The live query then re-renders in order.
//
// Shared by the top-level list and the subtask section, so both reorder identically.

type Orderable = { id: string; sort_order: string }

export function TaskSortList<T extends Orderable>({
  items,
  onMove,
  children,
}: {
  items: T[]
  // Called on drop with the moved id, its new fractional key, and the fully-reordered list (for
  // an optimistic render — see useOptimisticOrder).
  onMove: (id: string, key: string, reordered: T[]) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    // A small activation distance so a plain click on the handle still fires; only a real drag
    // past 4px lifts the row.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((t) => t.id === active.id)
    const newIndex = items.findIndex((t) => t.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    // Where the row lands, and who its neighbours become — the source of the new key.
    const reordered = arrayMove(items, oldIndex, newIndex)
    const prev = reordered[newIndex - 1]?.sort_order ?? null
    const next = reordered[newIndex + 1]?.sort_order ?? null
    try {
      onMove(String(active.id), keyBetween(prev, next), reordered)
    } catch {
      // Neighbours share a key (a rare offline collision) — no gap to insert into. Skip; the
      // next drag, against re-synced keys, resolves it.
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

// Optimistic ordering: renders a local reordered copy the instant a drop happens, so the row
// doesn't snap back to its old spot while the sort_order write round-trips through local SQLite
// and the reactive query. The override is dropped once the query reflects the new order (or the
// membership changes underneath us), after which the query is the single source of truth again.
export function useOptimisticOrder<T extends Orderable>(
  dbItems: T[],
  persist: (id: string, key: string) => void,
): { items: T[]; onMove: (id: string, key: string, reordered: T[]) => void } {
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

  return {
    items: optimistic ?? dbItems,
    onMove: (id, key, reordered) => {
      setOptimistic(reordered)
      persist(id, key)
    },
  }
}

// The per-row drag state: put `setNodeRef`/`style` on the row container and spread `handleProps`
// onto the grip button (which carries dnd-kit's keyboard + pointer listeners).
export type RowSortable = {
  setNodeRef: (el: HTMLElement | null) => void
  style: CSSProperties
  handleProps: Record<string, unknown>
  isDragging: boolean
}

export function useRowSortable(id: string): RowSortable {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  return {
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    handleProps: { ...attributes, ...listeners },
    isDragging,
  }
}

// A keyboard-accessible grip handle (dnd-kit's attributes make it focusable + arrow-sortable).
// `touch-none` stops the browser from scrolling instead of dragging on touch.
export function DragHandle({ handleProps }: { handleProps: Record<string, unknown> }) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      className="shrink-0 cursor-grab touch-none text-muted-foreground/40 transition hover:text-muted-foreground focus-visible:text-muted-foreground active:cursor-grabbing [&_svg]:size-4"
      {...handleProps}
    >
      <GripVertical />
    </button>
  )
}
