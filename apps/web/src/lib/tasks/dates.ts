import { activeTimezone, fromLocalFields, toLocalFields } from "@pace/validation"

// Timezone discipline for scheduling (P2-02): we STORE UTC ISO strings and RENDER/reason in the
// user's ACCOUNT zone (P2 Timezones — the active tz, auto-detected or pinned in Settings), not the
// raw device zone. The pickers speak local wall-clock — a required date ("YYYY-MM-DD") and an
// OPTIONAL time ("HH:mm") — so these bridge the two through the account tz. Each fn takes an explicit
// `tz` defaulting to the active zone, so it stays pure + testable (tests run in the env zone).
// Time is optional because a due date is usually a day ("due Friday"); when it's omitted we fall
// back to a sensible wall-clock time (see DUE_FALLBACK/START_FALLBACK).

const pad = (n: number) => String(n).padStart(2, "0")

// When only a date is picked, fall back to a sensible wall-clock time: end-of-day
// for a due date (so "due today" isn't overdue at 12:01am), start-of-day for start.
// These times also mean "no specific time" for display — see toOptionalTime/formatDate.
export const START_FALLBACK = "00:00"
export const DUE_FALLBACK = "23:59"

// UTC ISO → the account-zone date a <input type="date"> expects. "" clears.
export function toDateInput(iso: string | null, tz = activeTimezone()): string {
  if (!iso) return ""
  const f = toLocalFields(iso, tz)
  return `${f.y}-${pad(f.mo)}-${pad(f.d)}`
}

// UTC ISO → the account-zone time a <input type="time"> expects. "" when no date.
export function toTimeInput(iso: string | null, tz = activeTimezone()): string {
  if (!iso) return ""
  const f = toLocalFields(iso, tz)
  return `${pad(f.h)}:${pad(f.min)}`
}

// An account-zone date (required) + optional time → UTC ISO to store. No date → null
// (cleared). No time → the caller's fallback, so a date-only pick still saves as a full
// timestamp. The wall-clock is interpreted in `tz` (DST-correct), then serialised to UTC.
export function combineLocal(
  day: string,
  time: string,
  fallback: string,
  tz = activeTimezone(),
): string | null {
  if (!day) return null
  const [y, mo, d] = day.split("-").map(Number)
  const [h, min] = (time || fallback).split(":").map(Number)
  if ([y, mo, d, h, min].some((n) => n === undefined || Number.isNaN(n))) return null
  return fromLocalFields(
    { y: y as number, mo: mo as number, d: d as number, h: h as number, min: min as number },
    tz,
  ).toISOString()
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
  tz = activeTimezone(),
): "overdue" | "today" | "upcoming" | null {
  if (!dueIso || resolved) return null
  const due = toLocalFields(dueIso, tz)
  const now = toLocalFields(new Date(), tz)
  // Compare calendar days as YYYYMMDD integers — day-based, so a task due today stays "today" all
  // day regardless of clock time. Both sides are resolved in the account zone.
  const dueDay = due.y * 10000 + due.mo * 100 + due.d
  const today = now.y * 10000 + now.mo * 100 + now.d
  if (dueDay < today) return "overdue"
  if (dueDay > today) return "upcoming"
  return "today"
}
