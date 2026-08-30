import { activeTimezone, toLocalFields } from "@pace/validation"

// Timezone discipline for scheduling (P2-02): STORE UTC ISO strings; RENDER + reason in the user's
// ACCOUNT zone (P2 Timezones — the active tz, auto-detected or pinned in Settings). The native
// DateTimePicker works with device-local JS Date objects, so the input bridges (toDate/combineDay/
// combineTime) stay device-local for now; the display + overdue/today calc below use the account zone.

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

// UTC ISO → a friendly account-zone string. With a real time-of-day, includes it
// ("Aug 15, 1:00 PM"); for a date-only entry (hasTime false), just "Aug 15".
export function formatDate(iso: string | null, hasTime = false, tz = activeTimezone()): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString(undefined, {
    timeZone: tz,
    month: "short",
    day: "numeric",
    ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  })
}

// Just the account-zone time of a stored ISO, e.g. "1:00 PM" — for the time chip.
export function formatTime(iso: string | null, tz = activeTimezone()): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  })
}

// The due date's state relative to TODAY, by local CALENDAR DAY (not clock time):
// "overdue" before today, "today" on today, "upcoming" in the future — used to
// colour the list (red / yellow / neutral). null when there's no date or the task is
// resolved (a done-category task carries no urgency; P2-03 — `resolved` replaces the
// old `completed`). Day-based so a task due today stays "today" all day.
export function dueDayState(
  dueIso: string | null,
  resolved: boolean,
  tz = activeTimezone(),
): "overdue" | "today" | "upcoming" | null {
  if (!dueIso || resolved) return null
  const due = toLocalFields(dueIso, tz)
  const now = toLocalFields(new Date(), tz)
  // Compare calendar days as YYYYMMDD integers, resolved in the account zone — day-based, so a task
  // due today stays "today" all day regardless of clock time.
  const dueDay = due.y * 10000 + due.mo * 100 + due.d
  const today = now.y * 10000 + now.mo * 100 + now.d
  if (dueDay < today) return "overdue"
  if (dueDay > today) return "upcoming"
  return "today"
}
