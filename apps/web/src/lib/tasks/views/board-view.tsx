import type { TaskViewProps } from "./types"

// Board (kanban) view (P2-07 · step 4). Lazy-loaded — its own chunk. Stub for now; the real
// board (dnd-kit multi-container over statuses) lands in step 4.
export default function BoardView({ tasks }: TaskViewProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">Board view</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Building next — {tasks.length} task{tasks.length === 1 ? "" : "s"} ready.
      </p>
    </div>
  )
}
