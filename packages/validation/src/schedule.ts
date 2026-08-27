// The task's schedule as a range → (start, due). A single picked day is a lone DUE date (the common
// case), two distinct days a start→due range (the earlier end is the start), and the same day twice
// collapses back to a single due. Pure over local "YYYY-MM-DD" day strings ("" = none) so the web
// and mobile date pickers share one flow and can't drift — each app converts to/from its stored
// timestamps with its own date helpers.
export type Schedule = { start: string; due: string }

export function resolveScheduleRange(from: string, to: string): Schedule {
  if (from && to && from !== to) {
    // "YYYY-MM-DD" sorts chronologically — the earlier end is the start, the later the due.
    return from < to ? { start: from, due: to } : { start: to, due: from }
  }
  // A single pick (or the same day twice) is a lone due date, no start.
  return { start: "", due: from || to }
}
