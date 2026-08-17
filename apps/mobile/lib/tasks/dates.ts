// Timezone discipline for scheduling (P2-02): STORE UTC ISO strings, RENDER local.
// The native DateTimePicker works with JS Date objects (local time), so these
// bridge stored UTC ISO ↔ Date. (The web twin bridges to datetime-local strings.)

// UTC ISO → a Date for the picker (undefined when unset → picker opens at "now").
export function toDate(iso: string | null): Date | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}

// When only a date is picked, fall back to a sensible wall-clock time: end-of-day
// for a due date (so "due today" isn't overdue at 12:01am), start-of-day for start.
type Fallback = { hours: number; minutes: number }
export const START_FALLBACK: Fallback = { hours: 0, minutes: 0 }
export const DUE_FALLBACK: Fallback = { hours: 23, minutes: 59 }

// A chosen day (from the date picker) + a time — the existing time when hasTime,
// else the field's fallback — → UTC ISO to store. A date is always a full timestamp.
export function combineDay(
  day: Date,
  currentIso: string | null,
  hasTime: boolean,
  fallback: Fallback,
): string {
  const d = new Date(day)
  const current = toDate(currentIso)
  if (hasTime && current) d.setHours(current.getHours(), current.getMinutes(), 0, 0)
  else d.setHours(fallback.hours, fallback.minutes, 0, 0)
  return d.toISOString()
}

// A chosen time (from the time picker) + the existing day (or today) → UTC ISO.
// The caller marks hasTime true when using this.
export function combineTime(time: Date, currentIso: string | null): string {
  const d = toDate(currentIso) ?? new Date()
  d.setHours(time.getHours(), time.getMinutes(), 0, 0)
  return d.toISOString()
}

// UTC ISO → a friendly local string. With a real time-of-day, includes it
// ("Aug 15, 1:00 PM"); for a date-only entry (hasTime false), just "Aug 15".
export function formatDate(iso: string | null, hasTime = false): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  })
}

// Just the local time of a stored ISO, e.g. "1:00 PM" — for the time chip.
export function formatTime(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })
}

// The due date's state relative to TODAY, by local CALENDAR DAY (not clock time):
// "overdue" before today, "today" on today, "upcoming" in the future — used to
// colour the list (red / yellow / neutral). null when there's no date or the task is
// resolved (a done-category task carries no urgency; P2-03 — `resolved` replaces the
// old `completed`). Day-based so a task due today stays "today" all day.
export function dueDayState(
  dueIso: string | null,
  resolved: boolean,
): "overdue" | "today" | "upcoming" | null {
  if (!dueIso || resolved) return null
  const due = new Date(dueIso)
  const now = new Date()
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (dueDay < today) return "overdue"
  if (dueDay > today) return "upcoming"
  return "today"
}
