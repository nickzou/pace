import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "#/components/app-layout"
import { TaskDetail } from "#/lib/tasks/task-detail"

export const Route = createFileRoute("/tasks/$taskId")({ component: TaskDetailPage })

// The dedicated task detail view — the "real" surface future Phase-2 fields
// (tags, scheduling, subtasks) grow into. Reached from the quick modal's "Open
// full view" link; shares the same TaskDetail editor. Renders inside the shared
// AppLayout (sidebar + main) so it sits in the same shell as the task list.
function TaskDetailPage() {
  const { taskId } = Route.useParams()
  const navigate = useNavigate()

  return (
    <AppLayout>
      <header className="flex items-center gap-4 border-b border-border px-8 py-5">
        <div className="min-w-0 flex-1">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3.5"
          >
            <ArrowLeft /> Tasks
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Task detail</h1>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl border border-border bg-card p-6">
            <TaskDetail id={taskId} onDeleted={() => navigate({ to: "/" })} />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
