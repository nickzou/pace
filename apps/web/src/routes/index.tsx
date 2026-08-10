import { usePowerSync, useQuery } from "@powersync/react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { type FormEvent, useEffect, useState } from "react"
import { signOut, useSession } from "#/lib/auth-client"
import { PowerSyncProvider } from "#/lib/powersync/provider"

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

// Renders the local database only in the browser, for a signed-in user.
// @powersync/web (wa-sqlite) can't run during SSR, and there's nothing to sync
// until we can mint a token — so gate on both `mounted` and `session` before
// mounting the provider, which owns the DB lifecycle.
function Tasks() {
  const { data: session, isPending } = useSession()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (isPending || !mounted) return <p className="text-sm text-neutral-500">…</p>
  if (!session) {
    return (
      <p className="text-sm text-neutral-400">
        <Link to="/sign-in" className="text-sky-400 hover:underline">
          Sign in
        </Link>{" "}
        to see your tasks.
      </p>
    )
  }

  return (
    <PowerSyncProvider>
      <TaskList />
    </PowerSyncProvider>
  )
}

// Reads and writes go straight to local SQLite. useQuery is live — it re-runs
// whenever the tasks table changes, whether from a local write or a row synced
// down from the server — so there's no cache to invalidate and no optimistic
// bookkeeping. PowerSync uploads the local writes to the API in the background.
type TaskRow = { id: string; title: string; completed: number }

function TaskList() {
  const db = usePowerSync()
  const [title, setTitle] = useState("")
  const { data: tasks, isLoading } = useQuery<TaskRow>(
    "SELECT id, title, completed FROM tasks ORDER BY created_at DESC",
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

  const toggle = (task: TaskRow) =>
    db.execute("UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?", [
      task.completed ? 0 : 1,
      new Date().toISOString(),
      task.id,
    ])

  const remove = (id: string) => db.execute("DELETE FROM tasks WHERE id = ?", [id])

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
                onClick={() => toggle(task)}
                aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
                className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                  task.completed
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                    : "border-neutral-600"
                }`}
              >
                {task.completed ? "✓" : ""}
              </button>
              <span className={`flex-1 ${task.completed ? "text-neutral-500 line-through" : ""}`}>
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => remove(task.id)}
                aria-label="Delete task"
                className="text-neutral-600 transition hover:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
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
        <Tasks />
      </div>
    </main>
  )
}
