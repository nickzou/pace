import { describe, expect, it } from "vitest"
import { toDateInput } from "../dates"
import { buildCalendarData, buildEvent, localDay, rescheduleWrite } from "./calendar-logic"
import type { ListTask } from "./types"

// The date math is where calendar bugs hide (all-day ends are exclusive, date-only values carry a
// fallback wall-clock). These assertions build fixtures via local-time Dates and read them back
// through the same local helpers, so they hold in whatever timezone the suite runs under.

// A local-midnight instant for a Y-M-D, stored the way the app stores an all-day date.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString()

const task = (over: Partial<ListTask> = {}): ListTask => ({
  id: "t1",
  title: "Task",
  description: "",
  status_id: "s1",
  resolved_at: null,
  start_date: null,
  due_date: null,
  start_has_time: 0,
  due_has_time: 0,
  parent_id: null,
  sort_order: "a0",
  created_at: at(2026, 1, 1),
  updated_at: at(2026, 1, 1),
  status_name: "To Do",
  status_color: "blue",
  status_category: "open",
  status_group_id: "g1",
  child_count: 0,
  done_count: 0,
  ...over,
})

describe("buildEvent — placement", () => {
  it("places an all-day, due-only task on its due day with no end", () => {
    const e = buildEvent(task({ due_date: at(2026, 8, 15) }), "dark")
    expect(e.allDay).toBe(true)
    expect(e.start).toBe("2026-08-15")
    expect(e.end).toBeUndefined()
  })

  it("makes a start_date an all-day range with an EXCLUSIVE end (due + 1 day)", () => {
    const e = buildEvent(task({ start_date: at(2026, 8, 13), due_date: at(2026, 8, 15) }), "dark")
    expect(e.start).toBe("2026-08-13")
    expect(e.end).toBe("2026-08-16") // 15th inclusive ⇒ 16th exclusive
  })

  it("keeps raw ISO instants for a timed (has-time) event and is not all-day", () => {
    const due = "2026-08-15T09:30:00.000Z"
    const e = buildEvent(task({ due_date: due, due_has_time: 1 }), "dark")
    expect(e.allDay).toBe(false)
    expect(e.start).toBe(due)
    expect(e.end).toBeUndefined()
  })

  it("keeps both raw instants for a timed range", () => {
    const start = "2026-08-13T08:00:00.000Z"
    const due = "2026-08-15T09:30:00.000Z"
    const e = buildEvent(task({ start_date: start, due_date: due, due_has_time: 1 }), "dark")
    expect(e.allDay).toBe(false)
    expect(e.start).toBe(start)
    expect(e.end).toBe(due)
  })

  it("flags a subtask with the fc-subtask class, and nothing for a top-level task", () => {
    expect(
      buildEvent(task({ due_date: at(2026, 8, 15), parent_id: "p1" }), "dark").classNames,
    ).toEqual(["fc-subtask"])
    expect(buildEvent(task({ due_date: at(2026, 8, 15) }), "dark").classNames).toBeUndefined()
  })
})

describe("buildCalendarData — partition", () => {
  it("splits scheduled events from the unscheduled tray", () => {
    const tasks = [
      task({ id: "a", due_date: at(2026, 8, 15) }),
      task({ id: "b", due_date: null }),
      task({ id: "c", due_date: at(2026, 8, 20) }),
    ]
    const { events, unscheduled } = buildCalendarData(tasks, "dark")
    expect(events.map((e) => e.id)).toEqual(["a", "c"])
    expect(unscheduled.map((t) => t.id)).toEqual(["b"])
  })
})

describe("rescheduleWrite — writes", () => {
  it("moves a single event's due date, dropping to date-only when all-day", () => {
    const w = rescheduleWrite(task(), new Date(2026, 7, 20), null, true)
    expect(toDateInput(w.due_date)).toBe("2026-08-20")
    expect(w.due_has_time).toBe(0)
    expect(w.start_date).toBeUndefined()
  })

  it("writes an exact instant with has_time when the drop is timed", () => {
    const start = new Date("2026-08-20T14:00:00.000Z")
    const w = rescheduleWrite(task(), start, null, false)
    expect(w.due_date).toBe(start.toISOString())
    expect(w.due_has_time).toBe(1)
  })

  it("moves both ends of a range and undoes the exclusive end (all-day)", () => {
    const t = task({ start_date: at(2026, 8, 13), due_date: at(2026, 8, 15) })
    // Dragged to start 8/18, exclusive end 8/21 ⇒ due day is the 20th.
    const w = rescheduleWrite(t, new Date(2026, 7, 18), new Date(2026, 7, 21), true)
    expect(toDateInput(w.start_date ?? null)).toBe("2026-08-18")
    expect(toDateInput(w.due_date)).toBe("2026-08-20")
    expect(w.due_has_time).toBe(0)
  })
})

describe("localDay", () => {
  it("formats a local date as YYYY-MM-DD with zero-padding", () => {
    expect(localDay(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})
