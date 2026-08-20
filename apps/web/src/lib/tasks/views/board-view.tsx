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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { usePowerSync } from "@powersync/react"
import { useEffect, useMemo, useState } from "react"
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
// 6). dnd-kit multi-container: drag a card within a column to reorder, or across columns to change
// its status — committing setTaskStatus (P2-03) + setTaskOrder (P2-06 fractional key) on drop. An
// optimistic column map moves the card live during the drag so it doesn't snap back.

type Cols = Record<string, string[]> // statusId -> ordered task ids

// Columns read left→right as a workflow: open → in-progress → done. Within a category we keep the
// user's status `position` order (the query already sorts by it, and Array.sort is stable). Raw
// position alone is creation order, which put "Done" before "In Progress".
const CATEGORY_RANK: Record<string, number> = { open: 0, in_progress: 1, done: 2 }

export default function BoardView({
  tasks,
  allStatuses,
  statusesByGroup,
  tagsByTask,
  defaultStatusId,
  onOpen,
}: TaskViewProps) {
  const db = usePowerSync()

  // Columns = the default group's statuses (position-ordered, from the shared map).
  const defaultGroupId = allStatuses.find((s) => s.id === defaultStatusId)?.group_id
  const columns = useMemo<StatusOption[]>(() => {
    const group = defaultGroupId ? (statusesByGroup.get(defaultGroupId) ?? []) : []
    // Stable sort by category so position order is preserved within each category.
    return [...group].sort(
      (a, b) => (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9),
    )
  }, [defaultGroupId, statusesByGroup])

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  // The db-truth columns: each status's tasks in sort_order (tasks arrive sort_order-ordered).
  const dbCols = useMemo<Cols>(() => {
    const map: Cols = {}
    for (const c of columns) map[c.id] = []
    for (const t of tasks) map[t.status_id]?.push(t.id)
    return map
  }, [columns, tasks])

  // Optimistic override (see P2-06's useOptimisticOrder): render this while a drag/write is in
  // flight; drop it once the reactive query reflects the move.
  const [override, setOverride] = useState<Cols | null>(null)
  const dbSig = useMemo(() => JSON.stringify(dbCols), [dbCols])
  useEffect(() => {
    // Hand control back to the query once it reflects the move (the write landed). Reading dbSig
    // in the body is deliberate — it's the reconcile trigger, not just a dep.
    setOverride((cur) => (cur && JSON.stringify(cur) === dbSig ? null : cur))
  }, [dbSig])
  const cols = override ?? dbCols

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Which column holds `id` (a card id), or the column id itself when hovering an empty column.
  const columnOf = (id: string): string | undefined => {
    if (id in cols) return id
    return columns.find((c) => cols[c.id]?.includes(id))?.id
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  // Live cross-column move: pull the card out of its column and drop it into the one under the
  // cursor, so the card visually follows into the new column mid-drag.
  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
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

  // Commit on drop: reorder within the final column (override already reflects placement), then
  // write the fractional key and — if the column changed — the new status.
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveId(null)
    if (!over) return setOverride(null)
    const id = String(active.id)
    const to = columnOf(String(over.id))
    if (!to) return setOverride(null)

    const base = override ?? dbCols
    const list = [...(base[to] ?? [])]
    // Place the card at the over-position within the target column (within-column reorder).
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
      }}
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
      <DragOverlay>
        {activeId && taskById.get(activeId) ? (
          <Card task={taskById.get(activeId) as ListTask} tagsByTask={tagsByTask} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
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
  const { theme } = useTheme()
  const color = statusHex(status.color, theme)
  const { setNodeRef } = useSortable({ id: status.id, data: { column: true } })
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-card/50">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium">{status.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{taskIds.length}</span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 p-2">
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
