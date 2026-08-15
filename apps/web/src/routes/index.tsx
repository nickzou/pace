import { usePowerSync, useQuery } from "@powersync/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { signOut, useSession } from "#/lib/auth-client"
import { RequireLocalDb } from "#/lib/powersync/require-db"
import { formatDate, isOverdue } from "#/lib/tasks/dates"
import { deleteWithUndo, type Task, toggleTask } from "#/lib/tasks/mutations"
import { TaskModal } from "#/lib/tasks/task-modal"
import { useToast } from "#/lib/toast"

export const Route = createFileRoute("/")({ component: Home })

function AuthBar() {
  const { data: session, isPending } = useSession()

  return (
    <div className="mb-8 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
      {isPending ? (
        <span className="text-neutral-500">…</span>
      ) : session ? (
        <>
          <span className="text-neutral-400">
            Signed in as <span className="text-neutral-100">{session.user.email}</span>
          </span>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-md border border-neutral-700 px-3 py-1 text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100"
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <span className="text-neutral-400">You're not signed in.</span>
          <span className="flex gap-3">
            <Link to="/sign-in" className="text-sky-400 hover:underline">
              Sign in
            </Link>
            <Link to="/sign-up" className="text-sky-400 hover:underline">
              Sign up
            </Link>
          </span>
        </>
      )}
    </div>
  )
}

// Reads and writes go straight to local SQLite. useQuery is live — it re-runs
// whenever the tasks table changes, whether from a local write or a row synced
// down from the server — so there's no cache to invalidate and no optimistic
// bookkeeping. PowerSync uploads the local writes to the API in the background.
function TaskList() {
  const db = usePowerSync()
  const toast = useToast()
  const [title, setTitle] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: tasks, isLoading } = useQuery<Task>(
    "SELECT id, title, description, completed, start_date, due_date, start_has_time, due_has_time, created_at, updated_at FROM tasks ORDER BY created_at DESC",
  )

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
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
        Tasks
      </h2>

      <form onSubmit={add} className="mb-4 flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-neutral-950 transition hover:bg-sky-400 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">No tasks yet — add your first above.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <button
                type="button"
                onClick={() => void toggleTask(db, task)}
                aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                  task.completed
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                    : "border-neutral-600"
                }`}
              >
                {task.completed ? "✓" : ""}
              </button>
              <button
                type="button"
                onClick={() => setSelectedId(task.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className={task.completed ? "text-neutral-500 line-through" : ""}>
                  {task.title}
                </span>
                {task.description ? (
                  <span className="block truncate text-xs text-neutral-500">
                    {task.description}
                  </span>
                ) : null}
                {task.due_date ? (
                  <span
                    className={`block text-xs ${
                      isOverdue(task.due_date, task.completed) ? "text-red-400" : "text-neutral-500"
                    }`}
                  >
                    {isOverdue(task.due_date, task.completed) ? "Overdue · " : "Due "}
                    {formatDate(task.due_date, !!task.due_has_time)}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => void deleteWithUndo(db, task, toast)}
                aria-label="Delete task"
                className="shrink-0 text-neutral-600 transition hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId ? <TaskModal id={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </section>
  )
}

function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <AuthBar />
        <header className="mb-10">
          <h1 className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent">
            Pace
          </h1>
          <p className="mt-2 italic text-neutral-400">set your own pace</p>
        </header>
        <RequireLocalDb>
          <TaskList />
        </RequireLocalDb>
      </div>
    </main>
  )
}
