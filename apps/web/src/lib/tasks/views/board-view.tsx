import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { usePowerSync } from "@powersync/react"
import { CornerDownRight, GripVertical } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { reorderStatuses } from "#/lib/statuses/mutations"
import { TagChips } from "#/lib/tags/tag-control"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"
import { cn } from "#/lib/utils"
import { dueDayState, formatDate } from "../dates"
import { setTaskStatus } from "../mutations"
import { keyBetween, setTaskOrder } from "../order"
import type { StatusOption } from "../status-control"
import type { ListTask, TaskViewProps } from "./types"

// Board (kanban) view (P2-07 · step 4). Columns are the DEFAULT status group's statuses (decision
// 6). One dnd-kit context handles TWO kinds of drag, told apart by id namespace:
//   - a CARD (task id) drags within a column to reorder, or across columns to change its status —
//     setTaskStatus (P2-03) + setTaskOrder (P2-06 fractional key);
//   - a COLUMN ("col:<statusId>") drags to reorder columns — reorderStatuses (position renumber),
//     the same write Settings uses, so both stay in lockstep.
// Category is immutable, so a column move is clamped WITHIN its category band. Optimistic overlays
// (cards + columns) keep drags from snapping back while the writes round-trip.

type Cols = Record<string, string[]> // statusId -> ordered task ids

// Columns read left→right as a workflow: open → in-progress → done. Within a category we keep the
// user's status `position` order (the query already sorts by it, and Array.sort is stable).
const CATEGORY_RANK: Record<string, number> = { open: 0, in_progress: 1, done: 2 }
const COL = "col:"

export default function BoardView({
  tasks,
  allStatuses,
  statusesByGroup,
  tagsByTask,
  defaultStatusId,
  onOpen,
}: TaskViewProps) {
  const db = usePowerSync()

  const defaultGroupId = allStatuses.find((s) => s.id === defaultStatusId)?.group_id
  const dbColumns = useMemo<StatusOption[]>(() => {
    const group = defaultGroupId ? (statusesByGroup.get(defaultGroupId) ?? []) : []
    return [...group].sort(
      (a, b) => (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9),
    )
  }, [defaultGroupId, statusesByGroup])

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  // ---- Optimistic column order (for the column drag) ----
  const [colOrder, setColOrder] = useState<string[] | null>(null)
  useEffect(() => {
    setColOrder((cur) => {
      if (!cur) return null
      const dbIds = dbColumns.map((c) => c.id)
      const sameSet = cur.length === dbIds.length && cur.every((id) => dbIds.includes(id))
      return cur.join(",") === dbIds.join(",") || !sameSet ? null : cur
    })
  }, [dbColumns])
  const columns = colOrder
    ? (colOrder.map((id) => dbColumns.find((c) => c.id === id)).filter(Boolean) as StatusOption[])
    : dbColumns

  // ---- Optimistic card columns (for the card drag) ----
  const dbCols = useMemo<Cols>(() => {
    const map: Cols = {}
    for (const c of columns) map[c.id] = []
    for (const t of tasks) map[t.status_id]?.push(t.id)
    return map
  }, [columns, tasks])
  const [override, setOverride] = useState<Cols | null>(null)
  const dbSig = useMemo(() => JSON.stringify(dbCols), [dbCols])
  useEffect(() => {
    setOverride((cur) => (cur && JSON.stringify(cur) === dbSig ? null : cur))
  }, [dbSig])
  const cols = override ?? dbCols

  const [activeId, setActiveId] = useState<string | null>(null)
  const draggingColumn = activeId?.startsWith(COL) ?? false
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Normalise any drop target (card id, empty-column id, or "col:" id) to its column's status id.
  const columnOf = (raw: string): string | undefined => {
    const id = raw.startsWith(COL) ? raw.slice(COL.length) : raw
    if (id in cols) return id
    return columns.find((c) => cols[c.id]?.includes(id))?.id
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  // Only CARDS move between columns live; a column drag is left to the horizontal sortable.
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over || String(active.id).startsWith(COL)) return
    const from = columnOf(String(active.id))
    const to = columnOf(String(over.id))
    if (!from || !to || from === to) return
    setOverride((cur) => {
      const base = cur ?? dbCols
      const fromList = (base[from] ?? []).filter((x) => x !== active.id)
      const toList = [...(base[to] ?? [])]
      const overIdx = toList.indexOf(String(over.id))
      toList.splice(overIdx >= 0 ? overIdx : toList.length, 0, String(active.id))
      return { ...base, [from]: fromList, [to]: toList }
    })
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    const id = String(active.id)
    setActiveId(null)
    if (!over) {
      setOverride(null)
      setColOrder(null)
      return
    }

    // ---- Column reorder (within category band) ----
    if (id.startsWith(COL)) {
      const from = id.slice(COL.length)
      const to = columnOf(String(over.id))
      if (!to || from === to) return setColOrder(null)
      const fromCat = columns.find((c) => c.id === from)?.category
      const toCat = columns.find((c) => c.id === to)?.category
      if (fromCat !== toCat) return setColOrder(null) // bands stay intact
      const ids = columns.map((c) => c.id)
      const newIds = arrayMove(ids, ids.indexOf(from), ids.indexOf(to))
      setColOrder(newIds)
      void reorderStatuses(db, newIds)
      return
    }

    // ---- Card move (reorder / change status) ----
    const to = columnOf(String(over.id))
    if (!to) return setOverride(null)
    const base = override ?? dbCols
    const list = [...(base[to] ?? [])]
    const cur = list.indexOf(id)
    if (cur >= 0) list.splice(cur, 1)
    const overIdx = list.indexOf(String(over.id))
    const target = String(over.id) === to ? list.length : overIdx >= 0 ? overIdx : list.length
    list.splice(target, 0, id)
    setOverride({ ...base, [to]: list })

    const i = list.indexOf(id)
    const prev = i > 0 ? (taskById.get(list[i - 1] ?? "")?.sort_order ?? null) : null
    const next = taskById.get(list[i + 1] ?? "")?.sort_order ?? null
    try {
      void setTaskOrder(db, id, keyBetween(prev, next))
    } catch {
      // neighbours share a key (rare offline collision) — leave order; next drag resolves it.
    }
    if (taskById.get(id)?.status_id !== to) void setTaskStatus(db, id, to)
  }

  if (columns.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">No status columns to show.</p>
    )
  }

  const activeStatus = draggingColumn
    ? columns.find((c) => c.id === activeId?.slice(COL.length))
    : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setOverride(null)
        setColOrder(null)
      }}
    >
      <SortableContext
        items={columns.map((c) => `${COL}${c.id}`)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columns.map((c) => (
            <BoardColumn
              key={c.id}
              status={c}
              taskIds={cols[c.id] ?? []}
              taskById={taskById}
              tagsByTask={tagsByTask}
              onOpen={onOpen}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeStatus ? (
          <ColumnHeader status={activeStatus} count={cols[activeStatus.id]?.length ?? 0} dragging />
        ) : activeId && taskById.get(activeId) ? (
          <Card task={taskById.get(activeId) as ListTask} tagsByTask={tagsByTask} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function ColumnHeader({
  status,
  count,
  handleProps,
  dragging,
}: {
  status: StatusOption
  count: number
  handleProps?: Record<string, unknown>
  dragging?: boolean
}) {
  const { theme } = useTheme()
  const color = statusHex(status.color, theme)
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border px-3 py-2",
        dragging && "rounded-xl border bg-card shadow-lg",
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${status.name}`}
        className="shrink-0 cursor-grab text-muted-foreground/40 transition hover:text-muted-foreground active:cursor-grabbing [&_svg]:size-3.5"
        {...handleProps}
      >
        <GripVertical />
      </button>
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 truncate text-sm font-medium">{status.name}</span>
      <span className="ml-auto text-xs text-muted-foreground">{count}</span>
    </div>
  )
}

function BoardColumn({
  status,
  taskIds,
  taskById,
  tagsByTask,
  onOpen,
}: {
  status: StatusOption
  taskIds: string[]
  taskById: Map<string, ListTask>
  tagsByTask: TaskViewProps["tagsByTask"]
  onOpen: (id: string) => void
}) {
  // Column drag (via the header grip).
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `col:${status.id}`,
    data: { type: "column" },
  })
  // The card drop-area (lets cards land on an empty column). Distinct id (the status id).
  const { setNodeRef: setDropRef } = useSortable({ id: status.id, data: { column: true } })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border border-border bg-card/50",
        isDragging && "opacity-50",
      )}
    >
      <ColumnHeader
        status={status}
        count={taskIds.length}
        handleProps={{ ...attributes, ...listeners }}
      />
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div ref={setDropRef} className="flex min-h-24 flex-1 flex-col gap-2 p-2">
          {taskIds.map((id) => {
            const t = taskById.get(id)
            return t ? (
              <SortableCard key={id} task={t} tagsByTask={tagsByTask} onOpen={onOpen} />
            ) : null
          })}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCard({
  task,
  tagsByTask,
  onOpen,
}: {
  task: ListTask
  tagsByTask: TaskViewProps["tagsByTask"]
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <Card task={task} tagsByTask={tagsByTask} onOpen={onOpen} />
    </div>
  )
}

function Card({
  task: t,
  tagsByTask,
  onOpen,
  dragging,
}: {
  task: ListTask
  tagsByTask: TaskViewProps["tagsByTask"]
  onOpen?: (id: string) => void
  dragging?: boolean
}) {
  const resolved = t.status_category === "done"
  const tags = tagsByTask.get(t.id) ?? []
  const state = dueDayState(t.due_date, resolved)
  return (
    <button
      type="button"
      onClick={onOpen ? () => onOpen(t.id) : undefined}
      className={cn(
        "block w-full cursor-grab rounded-lg border border-border bg-card p-2.5 text-left shadow-sm active:cursor-grabbing",
        dragging && "rotate-2 shadow-lg",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-2 text-sm",
          resolved && "text-muted-foreground line-through",
        )}
      >
        {/* Subtask marker (P2-07): a subtle ↳ flags a card that's a subtask of another task. */}
        {t.parent_id ? (
          <CornerDownRight
            aria-label="Subtask"
            className="size-3 shrink-0 text-muted-foreground/70"
          />
        ) : null}
        <span className="min-w-0 truncate">{t.title}</span>
        {t.child_count > 0 ? (
          <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t.done_count}/{t.child_count}
          </span>
        ) : null}
      </span>
      {tags.length > 0 ? (
        <div className="mt-1.5">
          <TagChips tags={tags} taskId={t.id} max={3} />
        </div>
      ) : null}
      {t.due_date ? (
        <span
          className={cn(
            "mt-1.5 block text-[11px]",
            state === "overdue"
              ? "text-destructive"
              : state === "today"
                ? "text-warning"
                : "text-muted-foreground",
          )}
        >
          {state === "overdue" ? "Overdue · " : "Due "}
          {formatDate(t.due_date, !!t.due_has_time)}
        </span>
      ) : null}
    </button>
  )
}
