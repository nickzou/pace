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

// A local date (required) + optional local time → UTC ISO to store. No date → null
// (cleared). No time → the caller's fallback, so a date-only pick still saves as a
// full timestamp. new Date("YYYY-MM-DDTHH:mm") parses as LOCAL, so toISOString is UTC.
export function combineLocal(day: string, time: string, fallback: string): string | null {
  if (!day) return null
  const d = new Date(`${day}T${time || fallback}`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
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

// A local "YYYY-MM-DD" day → a local Date at midnight (the inverse of toDateInput's
// formatting). Used by the button-label formatters below, which work off day strings.
function dayToLocal(day: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y as number, (m as number) - 1, d as number)
}

// "Aug 18", adding the year (", 2027") only when the day isn't in `now`'s year — the
// range-picker button's compact form for each end of a range. No weekday.
export function formatMonthDay(day: string, now = new Date()): string {
  if (!day) return ""
  const d = dayToLocal(day)
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  })
}

// The date-range button's label for a SINGLE date. Within the coming week (0–6 days
// out) it reads as the weekday ("Friday") — "use day if less than a week from now";
// otherwise it's formatMonthDay ("Aug 18", + year when not the current year). A set
// time is appended ("Friday, 1:00 PM"). Past dates always use the month/day form.
export function formatDayLabel(day: string, time = "", now = new Date()): string {
  if (!day) return ""
  const d = dayToLocal(day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  const base =
    diffDays >= 0 && diffDays < 7
      ? d.toLocaleDateString(undefined, { weekday: "long" })
      : formatMonthDay(day, now)
  if (!time) return base
  const [h, min] = time.split(":").map(Number)
  const t = new Date(2000, 0, 1, h as number, min as number).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
  return `${base}, ${t}`
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
