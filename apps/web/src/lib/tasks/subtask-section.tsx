import { usePowerSync, useQuery } from "@powersync/react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"
import { useToast } from "../toast"
import { formatDate } from "./dates"
import { createTask, deleteWithUndo, type Task } from "./mutations"

// Subtasks nest at most this deep (top-level = 1). Kept in step with the server's MAX_DEPTH.
export const MAX_DEPTH = 5

type ChildRow = {
  id: string
  title: string
  due_date: string | null
  due_has_time: number
  status_color: string
  status_category: string
  child_count: number
  done_count: number
}

// The "Subtasks" section shown in a task's detail (P2-05). Lists the task's *direct*
// children — each opens its own detail (drill-down via the /tasks/$taskId route) — with an
// inline add composer and per-child delete. A child that itself has children shows a small
// done/total. Hidden once the parent sits at MAX_DEPTH (no room to nest further).
export function SubtaskSection({ parentId, depth }: { parentId: string; depth: number }) {
  const db = usePowerSync()
  const toast = useToast()
  const { theme } = useTheme()
  const [title, setTitle] = useState("")

  const { data: children } = useQuery<ChildRow>(
    `SELECT t.id, t.title, t.due_date, t.due_has_time,
            s.color AS status_color, s.category AS status_category,
            (SELECT count(*) FROM tasks c WHERE c.parent_id = t.id) AS child_count,
            (SELECT count(*) FROM tasks c JOIN statuses cs ON cs.id = c.status_id
               WHERE c.parent_id = t.id AND cs.category = 'done') AS done_count
     FROM tasks t JOIN statuses s ON s.id = t.status_id
     WHERE t.parent_id = ? ORDER BY t.created_at DESC`,
    [parentId],
  )
  // The default open status a new subtask is created with — same one the top-level composer uses.
  const { data: def } = useQuery<{ id: string }>(
    `SELECT s.id FROM statuses s JOIN status_groups g ON g.id = s.group_id
     WHERE g.is_default = 1 AND s.category = 'open' ORDER BY s.position LIMIT 1`,
  )
  const defaultStatusId = def[0]?.id

  const atMax = depth >= MAX_DEPTH
  const doneCount = children.filter((c) => c.status_category === "done").length

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
        <ul className="space-y-1">
          {children.map((c) => {
            const done = c.status_category === "done"
            return (
              <li key={c.id} className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: statusHex(c.status_color, theme) }}
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
                  onClick={() => void deleteWithUndo(db, { id: c.id } as Task, toast)}
                  className="shrink-0 text-xs text-muted-foreground transition hover:text-destructive"
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
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
            onClick={() => void add()}
            disabled={!title.trim()}
            className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  )
}
