import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog"
import { TaskDetail } from "#/lib/tasks/task-detail"

// The quick task view/editor: TaskDetail inside a shadcn/Radix Dialog — centered,
// with enter+exit animations, focus trapping, and Escape/overlay-to-close handled
// by Radix. Driven by the list's selected task id; `null` closes it. The header
// links through to the dedicated /tasks/$taskId route.
export function TaskModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  // Retain the last task id so the body stays rendered while the Dialog animates
  // out (Radix keeps the content mounted through the close transition).
  const [lastId, setLastId] = useState<string | null>(id)
  useEffect(() => {
    if (id) setLastId(id)
  }, [id])

  return (
    <Dialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {/* Roomier on desktop (lg+) so the two-column detail — fields + the persistent activity
          panel — has space to breathe; stays the default width on narrow/mobile. */}
      <DialogContent aria-describedby={undefined} className="lg:max-w-5xl">
        <DialogTitle className="sr-only">Task details</DialogTitle>
        {lastId ? (
          <>
            <Link
              to="/tasks/$taskId"
              params={{ taskId: lastId }}
              className="text-sm text-primary hover:underline"
            >
              Open full view →
            </Link>
            <TaskDetail key={lastId} id={lastId} onDeleted={onClose} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
