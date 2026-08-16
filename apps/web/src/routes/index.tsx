import { usePowerSync, useQuery } from "@powersync/react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, Search, Trash2 } from "lucide-react"
import { type FormEvent, useState } from "react"
import { AppLayout, VIEWS, type View } from "#/components/app-layout"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import { Input } from "#/components/ui/input"
import { dueDayState, formatDate } from "#/lib/tasks/dates"
import { deleteWithUndo, type Task, toggleTask } from "#/lib/tasks/mutations"
import { TaskModal } from "#/lib/tasks/task-modal"
import { useToast } from "#/lib/toast"
import { cn } from "#/lib/utils"

// The active smart view lives in the URL (?view=today|upcoming|overdue|all) so the
// sidebar nav — which lives in AppLayout and links here — works from any route and
// is deep-linkable. Absent/unknown → the "all" view.
export const Route = createFileRoute("/")({
  validateSearch: (search): { view?: View } => {
    const v = search.view
    return v === "today" || v === "upcoming" || v === "overdue" || v === "all" ? { view: v } : {}
  },
  component: Home,
})

const TASKS_SQL =
  "SELECT id, title, description, completed, start_date, due_date, start_has_time, due_has_time, created_at, updated_at FROM tasks ORDER BY created_at DESC"

function Home() {
  return (
    <AppLayout>
      <TaskListView />
    </AppLayout>
  )
}

// The task list surface. Rendered inside AppLayout's PowerSync provider, so the
// query/mutations are safe. The view filter comes from the URL; text search is local.
function TaskListView() {
  const db = usePowerSync()
  const toast = useToast()
  const { data: tasks, isLoading } = useQuery<Task>(TASKS_SQL)
  const { view = "all" } = Route.useSearch()

  const [search, setSearch] = useState("")
  const [title, setTitle] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const q = search.trim().toLowerCase()
  const visible = tasks
    .filter((t) => (view === "all" ? true : dueDayState(t.due_date, t.completed) === view))
    .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))

  const currentLabel = VIEWS.find((v) => v.key === view)?.label ?? "All tasks"

  async function add(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    await db.execute(
      "INSERT INTO tasks (id, title, description, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), trimmed, "", 0, now, now],
    )
    setTitle("")
  }

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border px-8 py-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{currentLabel}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${visible.length} ${visible.length === 1 ? "task" : "tasks"}`}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-56 pl-9"
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <form onSubmit={add} className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task…"
              className="flex-1"
            />
            <Button type="submit" disabled={!title.trim()}>
              <Plus /> Add
            </Button>
          </form>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {search.trim()
                ? "No tasks match your search."
                : view === "all"
                  ? "No tasks yet — add your first above."
                  : `Nothing ${currentLabel.toLowerCase()}.`}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {visible.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  first={i === 0}
                  onToggle={() => void toggleTask(db, task)}
                  onOpen={() => setSelectedId(task.id)}
                  onDelete={() => void deleteWithUndo(db, task, toast)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedId ? <TaskModal id={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </>
  )
}

function TaskRow({
  task,
  first,
  onToggle,
  onOpen,
  onDelete,
}: {
  task: Task
  first: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  const dueState = dueDayState(task.due_date, task.completed)
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
        !first && "border-t border-border",
      )}
    >
      <Checkbox
        checked={!!task.completed}
        onCheckedChange={onToggle}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            "block truncate text-sm",
            task.completed && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </span>
        {task.description ? (
          <span className="block truncate text-xs text-muted-foreground">{task.description}</span>
        ) : null}
        {task.due_date ? (
          <span
            className={cn(
              "block text-xs",
              dueState === "overdue"
                ? "text-destructive"
                : dueState === "today"
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            {dueState === "overdue" ? "Overdue · " : "Due "}
            {formatDate(task.due_date, !!task.due_has_time)}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete task"
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 [&_svg]:size-4"
      >
        <Trash2 />
      </button>
    </div>
  )
}
