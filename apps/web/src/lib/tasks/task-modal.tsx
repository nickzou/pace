import { Link } from "@tanstack/react-router"
import { useEffect } from "react"
import { TaskDetail } from "#/lib/tasks/task-detail"

// The quick task view/editor: TaskDetail in a modal overlay. Shares TaskDetail
// with the dedicated /tasks/$taskId route; the header links through to it.
// Closes on backdrop click, the ✕, or Escape.
export function TaskModal({ id, onClose }: { id: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center px-4 py-16">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 bg-black/60 animate-in fade-in-0 duration-200"
      />
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl animate-in fade-in-0 slide-in-from-top-4 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/tasks/$taskId"
            params={{ taskId: id }}
            className="text-sm text-primary hover:underline"
          >
            Open full view →
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground transition hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <TaskDetail id={id} onDeleted={onClose} />
      </div>
    </div>
  )
}
