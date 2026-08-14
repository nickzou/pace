import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { RequireLocalDb } from "#/lib/powersync/require-db"
import { TaskDetail } from "#/lib/tasks/task-detail"

export const Route = createFileRoute("/tasks/$taskId")({ component: TaskDetailPage })

// The dedicated task detail view — the "real" surface future Phase-2 fields
// (tags, scheduling, subtasks) grow into. Reached from the quick modal's "Open
// full view" link; shares the same TaskDetail editor.
function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const navigate = useNavigate()

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link to="/" className="text-sm text-sky-400 hover:underline">
          ← Tasks
        </Link>
        <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
          <RequireLocalDb>
            <TaskDetail id={taskId} onDeleted={() => navigate({ to: "/" })} />
          </RequireLocalDb>
        </div>
      </div>
    </main>
  )
}
