import type { TaskViewProps } from "./types"

// Calendar view (P2-07 · step 5). Lazy-loaded — its own chunk, and this is the heavy one
// (FullCalendar), so keeping it out of the entry bundle is the point (§6). Stub for now.
export default function CalendarView({ tasks }: TaskViewProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">Calendar view</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Building next — {tasks.length} task{tasks.length === 1 ? "" : "s"} ready.
      </p>
    </div>
  )
}
