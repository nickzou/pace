// Timezone discipline for scheduling (P2-02): we STORE UTC ISO strings and RENDER
// in the viewer's local zone. A native <input type="datetime-local"> speaks local
// wall-clock ("YYYY-MM-DDTHH:mm", no zone), so these bridge the two.

const pad = (n: number) => String(n).padStart(2, "0")

// UTC ISO → the local wall-clock value a datetime-local input expects. "" clears.
export function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// A datetime-local value (local wall-clock) → UTC ISO to store. Empty → null.
// new Date(localString) parses it as LOCAL time, so toISOString() yields UTC.
export function fromLocalInput(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// UTC ISO → a friendly local string, e.g. "Aug 15, 1:00 PM".
export function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

// Overdue = a due date in the past on a task that isn't done. `completed` is the
// SQLite 0/1 int.
export function isOverdue(dueIso: string | null, completed: number): boolean {
  if (!dueIso || completed) return false
  return new Date(dueIso).getTime() < Date.now()
}
