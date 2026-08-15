// Timezone discipline for scheduling (P2-02): we STORE UTC ISO strings and RENDER
// in the viewer's local zone. The pickers speak local wall-clock — a required
// date ("YYYY-MM-DD") and an OPTIONAL time ("HH:mm") — so these bridge the two.
// Time is optional because a due date is usually a day ("due Friday"); when it's
// omitted we fall back to a sensible wall-clock time (see DUE_FALLBACK/START_FALLBACK).

const pad = (n: number) => String(n).padStart(2, "0")

// When only a date is picked, fall back to a sensible wall-clock time: end-of-day
// for a due date (so "due today" isn't overdue at 12:01am), start-of-day for start.
// These times also mean "no specific time" for display — see toOptionalTime/formatDate.
export const START_FALLBACK = "00:00"
export const DUE_FALLBACK = "23:59"

// UTC ISO → the local date a <input type="date"> expects. "" clears.
export function toDateInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// UTC ISO → the local time a <input type="time"> expects. "" when no date.
export function toTimeInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The time to show in the OPTIONAL time field: blank when it's exactly the caller's
// fallback (i.e. a date-only entry). This makes clearing the time a durable unset —
// it round-trips as blank instead of reappearing as the default on the next load.
export function toOptionalTime(iso: string | null, fallback: string): string {
  const time = toTimeInput(iso)
  return time === fallback ? "" : time
}

// A local date (required) + optional local time → UTC ISO to store. No date → null
// (cleared). No time → the caller's fallback, so a date-only pick still saves as a
// full timestamp. new Date("YYYY-MM-DDTHH:mm") parses as LOCAL, so toISOString is UTC.
export function combineLocal(day: string, time: string, fallback: string): string | null {
  if (!day) return null
  const d = new Date(`${day}T${time || fallback}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// UTC ISO → a friendly local string, e.g. "Aug 15, 1:00 PM". Pass the field's
// no-time fallback to render date-only entries without a time, e.g. just "Aug 15".
export function formatDate(iso: string | null, noTimeAt?: string): string {
  if (!iso) return ""
  const dateOnly = noTimeAt !== undefined && toTimeInput(iso) === noTimeAt
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
  })
}

// Overdue = a due date in the past on a task that isn't done. `completed` is the
// SQLite 0/1 int.
export function isOverdue(dueIso: string | null, completed: number): boolean {
  if (!dueIso || completed) return false
  return new Date(dueIso).getTime() < Date.now()
}
