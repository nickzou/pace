import { usePowerSync, useQuery } from "@powersync/react"
import { Link } from "@tanstack/react-router"
import { X } from "lucide-react"
import { useMemo, useState } from "react"
import { StatusControl, type StatusOption } from "#/lib/tasks/status-control"
import { useToast } from "../toast"
import { formatDate } from "./dates"
import { createTask, deleteWithUndo, setTaskStatus, type Task } from "./mutations"
import { setTaskOrder } from "./order"
import { DragHandle, TaskSortList, useOptimisticOrder, useRowSortable } from "./order-dnd"

// Subtasks nest at most this deep (top-level = 1). Kept in step with the server's MAX_DEPTH.
export const MAX_DEPTH = 5

type ChildRow = {
  id: string
  title: string
  due_date: string | null
  due_has_time: number
  status_id: string
  status_name: string
  status_color: string
  status_category: string
  status_group_id: string
  child_count: number
  done_count: number
  sort_order: string
}

// One draggable subtask row. Calls useRowSortable (needs the TaskSortList's SortableContext) and
// renders the grip + status + drill-down link + delete. Reordering here writes the child's
// sort_order within the parent scope — the same fractional-key mechanism as the top-level list.
function SubtaskRow({
  child: c,
  options,
  onSelectStatus,
  onDelete,
}: {
  child: ChildRow
  options: StatusOption[]
  onSelectStatus: (statusId: string) => void
  onDelete: () => void
}) {
  const s = useRowSortable(c.id)
  const done = c.status_category === "done"
  return (
    <li
      ref={s.setNodeRef}
      style={s.style}
      className={`flex items-center gap-2 py-1.5 ${s.isDragging ? "relative z-10 opacity-80" : ""}`}
    >
      <DragHandle handleProps={s.handleProps} />
      <StatusControl
        current={{
          id: c.status_id,
          name: c.status_name,
          color: c.status_color,
          category: c.status_category,
        }}
        options={options}
        onSelect={onSelectStatus}
      />
      <Link
        to="/tasks/$taskId"
        params={{ taskId: c.id }}
        className={`min-w-0 flex-1 truncate text-sm hover:underline ${
          done ? "text-muted-foreground line-through" : "text-foreground"
        }`}
      >
        {c.title}
      </Link>
      {c.child_count > 0 ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {c.done_count}/{c.child_count}
        </span>
      ) : null}
      {c.due_date ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatDate(c.due_date, !!c.due_has_time)}
        </span>
      ) : null}
      <button
        type="button"
        aria-label={`Delete ${c.title}`}
        onClick={onDelete}
        className="shrink-0 text-muted-foreground transition hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>
    </li>
  )
}

// The "Subtasks" section shown in a task's detail (P2-05). Lists the task's *direct*
// children — each opens its own detail (drill-down via the /tasks/$taskId route) — with an
// inline add composer and per-child delete. A child that itself has children shows a small
// done/total. Hidden once the parent sits at MAX_DEPTH (no room to nest further).
export function SubtaskSection({ parentId, depth }: { parentId: string; depth: number }) {
  const db = usePowerSync()
  const toast = useToast()
  const [title, setTitle] = useState("")

  const { data: children } = useQuery<ChildRow>(
    `SELECT t.id, t.title, t.due_date, t.due_has_time, t.status_id, t.sort_order,
            s.name AS status_name, s.color AS status_color, s.category AS status_category,
            s.group_id AS status_group_id,
            (SELECT count(*) FROM tasks c WHERE c.parent_id = t.id) AS child_count,
            (SELECT count(*) FROM tasks c JOIN statuses cs ON cs.id = c.status_id
               WHERE c.parent_id = t.id AND cs.category = 'done') AS done_count
     FROM tasks t JOIN statuses s ON s.id = t.status_id
     WHERE t.parent_id = ? ORDER BY t.sort_order, t.id`,
    [parentId],
  )
  // All statuses, grouped by their list — so each child's control offers only its own group's
  // options (a child may sit in a different status list from the parent).
  const { data: allStatuses } = useQuery<StatusOption & { group_id: string }>(
    "SELECT id, group_id, name, color, category FROM statuses ORDER BY position",
  )
  const statusesByGroup = useMemo(() => {
    const map = new Map<string, StatusOption[]>()
    for (const s of allStatuses) {
      const arr = map.get(s.group_id) ?? []
      arr.push({ id: s.id, name: s.name, color: s.color, category: s.category })
      map.set(s.group_id, arr)
    }
    return map
  }, [allStatuses])
  // The default open status a new subtask is created with — same one the top-level composer uses.
  const { data: def } = useQuery<{ id: string }>(
    `SELECT s.id FROM statuses s JOIN status_groups g ON g.id = s.group_id
     WHERE g.is_default = 1 AND s.category = 'open' ORDER BY s.position LIMIT 1`,
  )
  const defaultStatusId = def[0]?.id

  const atMax = depth >= MAX_DEPTH
  const doneCount = children.filter((c) => c.status_category === "done").length

  // Optimistic order so a reorder drop doesn't snap back while the write round-trips.
  const { items: orderedChildren, onMove } = useOptimisticOrder(children, (id, key) =>
    setTaskOrder(db, id, key),
  )

  const add = async () => {
    const t = title.trim()
    if (!t || !defaultStatusId) return
    await createTask(db, { title: t, statusId: defaultStatusId, parentId })
    setTitle("")
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Subtasks
        </h3>
        {children.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {doneCount}/{children.length}
          </span>
        ) : null}
      </div>

      {children.length > 0 ? (
        <TaskSortList items={orderedChildren} onMove={onMove}>
          <ul className="space-y-1">
            {orderedChildren.map((c) => (
              <SubtaskRow
                key={c.id}
                child={c}
                options={statusesByGroup.get(c.status_group_id) ?? []}
                onSelectStatus={(sid) => void setTaskStatus(db, c.id, sid)}
                onDelete={() => void deleteWithUndo(db, { id: c.id } as Task, toast)}
              />
            ))}
          </ul>
        </TaskSortList>
      ) : null}

      {atMax ? (
        <p className="text-xs text-muted-foreground">Maximum nesting depth reached.</p>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void add()
              }
            }}
            placeholder="Add a subtask…"
            className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:border-ring"
          />
          <button
            type="button"
            aria-label="Add subtask"
            onClick={() => void add()}
            disabled={!title.trim() || !defaultStatusId}
            className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
