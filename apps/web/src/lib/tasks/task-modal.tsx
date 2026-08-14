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
        className="fixed inset-0 bg-black/60"
      />
      <div
        className="relative w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/tasks/$taskId"
            params={{ taskId: id }}
            className="text-sm text-sky-400 hover:underline"
          >
            Open full view →
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 transition hover:text-neutral-200"
          >
            ✕
          </button>
        </div>
        <TaskDetail id={id} onDeleted={onClose} />
      </div>
    </div>
  )
}
