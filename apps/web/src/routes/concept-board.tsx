import { createFileRoute, notFound } from "@tanstack/react-router"
import { Flag, MoreHorizontal, Plus } from "lucide-react"
import {
  ConceptSwitcher,
  type ConceptTask,
  dueBadge,
  GROUPS,
  listDot,
  TASKS,
} from "#/components/concept-kit"
import { cn } from "#/lib/utils"

// Concept 3 — a kanban board, columns by urgency. Cards you'd drag between columns
// to reschedule (static here).
export const Route = createFileRoute("/concept-board")({
  beforeLoad: () => {
    if (import.meta.env.PROD) throw notFound()
  },
  component: Board,
})

const columnAccent: Record<string, string> = {
  overdue: "bg-destructive",
  today: "bg-warning",
  upcoming: "bg-primary",
}

function Board() {
  return (
    <div className="flex h-screen flex-col bg-background font-sans text-foreground">
      <header className="flex items-center gap-4 border-b border-border px-8 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Board</h1>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {TASKS.length} tasks
        </span>
        <button
          type="button"
          className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="size-4" /> Add task
        </button>
      </header>

      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex h-full gap-4">
          {GROUPS.map((col) => {
            const tasks = TASKS.filter((t) => t.state === col.key)
            return (
              <div key={col.key} className="flex w-72 shrink-0 flex-col">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className={cn("size-2 rounded-full", columnAccent[col.key])} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{tasks.length}</span>
                  <button
                    type="button"
                    className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto">
                  {tasks.map((t) => (
                    <BoardCard key={t.id} task={t} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <ConceptSwitcher current="/concept-board" />
    </div>
  )
}

function BoardCard({ task }: { task: ConceptTask }) {
  return (
    <div className="group cursor-grab rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-muted-foreground/40 active:cursor-grabbing">
      <div className="mb-1.5 flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{task.title}</p>
        <button
          type="button"
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>
      {task.note ? (
        <p className="mb-2.5 line-clamp-2 text-xs text-muted-foreground">{task.note}</p>
      ) : null}
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", listDot[task.list])} />
          {task.list}
        </span>
        {task.priority === "high" ? (
          <Flag className="size-3 text-destructive" fill="currentColor" />
        ) : null}
        <span
          className={cn(
            "ml-auto rounded px-1.5 py-0.5 text-[11px] font-medium",
            dueBadge[task.state],
          )}
        >
          {task.due}
        </span>
      </div>
    </div>
  )
}
