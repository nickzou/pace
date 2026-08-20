import type { TaskViewProps } from "./types"

// Table view (P2-07 · step 3). Lazy-loaded — its own chunk. Stub for now; the real table
// (@tanstack/react-table + react-virtual) lands in step 3.
export default function TableView({ tasks }: TaskViewProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">Table view</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Building next — {tasks.length} task{tasks.length === 1 ? "" : "s"} ready.
      </p>
    </div>
  )
}
