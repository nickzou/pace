// Timezone discipline for scheduling (P2-02): STORE UTC ISO strings, RENDER local.
// The native DateTimePicker works with JS Date objects (local time), so these
// bridge stored UTC ISO ↔ Date. (The web twin bridges to datetime-local strings.)

// UTC ISO → a Date for the picker (undefined when unset → picker opens at "now").
export function toDate(iso: string | null): Date | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}

// A Date the picker returned (local wall-clock) → UTC ISO to store.
export function fromDate(d: Date): string {
  return d.toISOString()
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
