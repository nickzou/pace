import { occurrencesBetween } from "@pace/validation"
import { combineLocal, DUE_FALLBACK, START_FALLBACK } from "../dates"
import { statusHex } from "../status-control"
import type { ListTask } from "./types"

// Pure calendar logic (P2-07), split out of calendar-view so the date math — which is where the
// off-by-one bugs live — is unit-testable without a DOM or FullCalendar.

export const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, "0")
// A Date → local "YYYY-MM-DD" (FullCalendar reads all-day dates in local terms, not UTC).
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export type CalendarEvent = {
  id: string
  title: string
  start: string
  end?: string
  allDay: boolean
  backgroundColor: string
  borderColor: string
  classNames?: string[]
  editable?: boolean
}

// The prefix on a ghost event's id (P2-08). Strip it to recover the real task id on click.
export const GHOST_PREFIX = "ghost:"

// One task → its FullCalendar event. Placed by due_date; a start_date makes it a start→due range.
// For all-day events the end is EXCLUSIVE, so a range that ends "on" the due day extends to due+1.
export function buildEvent(t: ListTask, theme: "dark" | "light"): CalendarEvent {
  const allDay = !t.due_has_time
  const color = statusHex(t.status_color, theme)
  const due = t.due_date as string
  // Subtask marker (P2-07): a class prefixes the event title with a subtle ↳ (see styles.css).
  const classNames = t.parent_id ? ["fc-subtask"] : undefined
  if (t.start_date) {
    return {
      id: t.id,
      title: t.title,
      start: allDay ? localDay(new Date(t.start_date)) : t.start_date,
      end: allDay ? localDay(new Date(new Date(due).getTime() + DAY_MS)) : due,
      allDay,
      backgroundColor: color,
      borderColor: color,
      classNames,
    }
  }
  return {
    id: t.id,
    title: t.title,
    start: allDay ? localDay(new Date(due)) : due,
    allDay,
    backgroundColor: color,
    borderColor: color,
    classNames,
  }
}

// Split the shared task set into placed events + the unscheduled tray (no due_date).
export function buildCalendarData(tasks: ListTask[], theme: "dark" | "light") {
  const unscheduled = tasks.filter((t) => !t.due_date)
  const events = tasks.filter((t) => t.due_date).map((t) => buildEvent(t, theme))
  return { events, unscheduled }
}

// Faded, non-draggable projections of each repeating task's UPCOMING occurrences within the visible
// window (P2-08 §8) — virtual, never stored. The real current occurrence renders via buildEvent; a
// ghost is every occurrence strictly after it, computed tz-correctly by the recurrence engine. Click
// still opens the task (the id keeps the GHOST_PREFIX so the view can recover it).
export function buildGhosts(
  tasks: ListTask[],
  windowStartIso: string,
  windowEndIso: string,
  theme: "dark" | "light",
  tz: string,
): CalendarEvent[] {
  const ghosts: CalendarEvent[] = []
  for (const t of tasks) {
    if (!t.recurrence || !t.due_date) continue
    const color = statusHex(t.status_color, theme)
    const classNames = ["fc-ghost", ...(t.parent_id ? ["fc-subtask"] : [])]
    for (const iso of occurrencesBetween(
      t.recurrence,
      t.due_date,
      windowStartIso,
      windowEndIso,
      tz,
    )) {
      ghosts.push({
        id: `${GHOST_PREFIX}${t.id}:${iso}`,
        title: t.title,
        start: t.due_has_time ? iso : localDay(new Date(iso)),
        allDay: !t.due_has_time,
        backgroundColor: color,
        borderColor: color,
        classNames,
        editable: false,
      })
    }
  }
  return ghosts
}

export type RescheduleWrite = {
  start_date?: string | null
  due_date: string | null
  due_has_time: 0 | 1
}

// New dates for a dragged/resized/dropped event, honouring the app's date convention (date-only →
// fallback wall-clock, has_time=false). A range (task has a start_date and the event has an end)
// moves both ends — undoing the +1 exclusive end; a single event moves only the due date.
export function rescheduleWrite(
  t: ListTask,
  start: Date,
  end: Date | null,
  allDay: boolean,
): RescheduleWrite {
  if (t.start_date && end) {
    const due = allDay ? new Date(end.getTime() - DAY_MS) : end
    return {
      start_date: allDay ? combineLocal(localDay(start), "", START_FALLBACK) : start.toISOString(),
      due_date: allDay ? combineLocal(localDay(due), "", DUE_FALLBACK) : due.toISOString(),
      due_has_time: allDay ? 0 : 1,
    }
  }
  return {
    due_date: allDay ? combineLocal(localDay(start), "", DUE_FALLBACK) : start.toISOString(),
    due_has_time: allDay ? 0 : 1,
  }
}
