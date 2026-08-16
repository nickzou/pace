import { usePowerSync, useQuery } from "@powersync/react"
import { createFileRoute } from "@tanstack/react-router"
import {
  AlertTriangle,
  CalendarDays,
  ListTodo,
  LogOut,
  Plus,
  Search,
  Sun,
  Trash2,
} from "lucide-react"
import { type FormEvent, type ReactNode, useState } from "react"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import { Input } from "#/components/ui/input"
import { signOut, useSession } from "#/lib/auth-client"
import { RequireLocalDb } from "#/lib/powersync/require-db"
import { dueDayState, formatDate } from "#/lib/tasks/dates"
import { deleteWithUndo, type Task, toggleTask } from "#/lib/tasks/mutations"
import { TaskModal } from "#/lib/tasks/task-modal"
import { useToast } from "#/lib/toast"
import { cn } from "#/lib/utils"

export const Route = createFileRoute("/")({ component: Home })

const TASKS_SQL =
  "SELECT id, title, description, completed, start_date, due_date, start_has_time, due_has_time, created_at, updated_at FROM tasks ORDER BY created_at DESC"

// The four smart views. "all" lists everything; the date views filter by the task's
// due-day state (which is null for completed tasks, so they drop out of dated views).
type View = "all" | "today" | "upcoming" | "overdue"
const VIEWS: { key: View; label: string; icon: ReactNode }[] = [
  { key: "today", label: "Today", icon: <Sun /> },
  { key: "upcoming", label: "Upcoming", icon: <CalendarDays /> },
  { key: "overdue", label: "Overdue", icon: <AlertTriangle /> },
  { key: "all", label: "All tasks", icon: <ListTodo /> },
]

function Home() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <RequireLocalDb>
        <AppShell />
      </RequireLocalDb>
    </div>
  )
}

// The full sidebar shell, wired to the local DB. Rendered only once RequireLocalDb has
// a signed-in session + the PowerSync database, so useQuery/usePowerSync are safe here.
function AppShell() {
  const db = usePowerSync()
  const toast = useToast()
  const { data: session } = useSession()
  const { data: tasks, isLoading } = useQuery<Task>(TASKS_SQL)

  const [view, setView] = useState<View>("all")
  const [search, setSearch] = useState("")
  const [title, setTitle] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const count = (v: View) =>
    v === "all"
      ? tasks.length
      : tasks.filter((t) => dueDayState(t.due_date, t.completed) === v).length

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

  const email = session?.user.email ?? ""
  const initials = email.slice(0, 2).toUpperCase() || "··"

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-card/40 p-4">
        <div className="bg-gradient-to-r from-brand-from to-brand-to bg-clip-text px-2 text-2xl font-bold tracking-tight text-transparent">
          Pace
        </div>

        <nav className="flex flex-col gap-0.5">
          {VIEWS.map((v) => (
            <NavItem
              key={v.key}
              icon={v.icon}
              label={v.label}
              count={count(v.key)}
              active={v.key === view}
              danger={v.key === "overdue"}
              onClick={() => setView(v.key)}
            />
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 rounded-lg px-2 py-2 text-sm">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={email}>
            {email || "Signed in"}
          </span>
          <button
            type="button"
            onClick={() => signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
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
      </main>

      {selectedId ? <TaskModal id={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  )
}

function NavItem({
  icon,
  label,
  count,
  active,
  danger,
  onClick,
}: {
  icon: ReactNode
  label: string
  count: number
  active?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 ? (
        <span className={cn("text-xs", danger ? "text-destructive" : "text-muted-foreground")}>
          {count}
        </span>
      ) : null}
    </button>
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
