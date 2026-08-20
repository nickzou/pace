import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin, { Draggable } from "@fullcalendar/interaction"
import FullCalendar from "@fullcalendar/react"
import { usePowerSync } from "@powersync/react"
import { useEffect, useMemo, useRef } from "react"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"
import { combineLocal, DUE_FALLBACK, START_FALLBACK } from "../dates"
import { updateTask } from "../mutations"
import type { ListTask, TaskViewProps } from "./types"

// Calendar view (P2-07 · step 5). FullCalendar month grid over the shared tasks, placed by due_date
// (a start_date makes it a start→due range — decision 8). Drag/resize an event or drop an
// unscheduled task onto a day → updateTask (P2-02 dates). Colour follows the task's status. This is
// the heavy view, lazy-loaded + client-only (§6). FullCalendar v6 auto-injects its own CSS.
const pad = (n: number) => String(n).padStart(2, "0")
const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const DAY_MS = 86_400_000

export default function CalendarView({ tasks, onOpen }: TaskViewProps) {
  const db = usePowerSync()
  const { theme } = useTheme()
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const { events, unscheduled } = useMemo(() => {
    const unscheduled = tasks.filter((t) => !t.due_date)
    const events = tasks
      .filter((t) => t.due_date)
      .map((t) => {
        const allDay = !t.due_has_time
        const color = statusHex(t.status_color, theme)
        const due = t.due_date as string
        // A start_date makes it a multi-day range; an all-day end is exclusive (+1 day).
        if (t.start_date) {
          return {
            id: t.id,
            title: t.title,
            start: allDay ? localDay(new Date(t.start_date)) : t.start_date,
            end: allDay ? localDay(new Date(new Date(due).getTime() + DAY_MS)) : due,
            allDay,
            backgroundColor: color,
            borderColor: color,
          }
        }
        return {
          id: t.id,
          title: t.title,
          start: allDay ? localDay(new Date(due)) : due,
          allDay,
          backgroundColor: color,
          borderColor: color,
        }
      })
    return { events, unscheduled }
  }, [tasks, theme])

  // Wire the unscheduled tray as an external drag source (drop onto a day schedules the task).
  const trayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!trayRef.current) return
    const draggable = new Draggable(trayRef.current, {
      itemSelector: "[data-task-id]",
      eventData: (el) => ({ id: el.getAttribute("data-task-id") ?? undefined }),
    })
    return () => draggable.destroy()
  }, [])

  // Write new dates back through the P2-02 mutation, honouring the app's date convention (date-only
  // → fallback wall-clock, has_time=false). A range moves both ends; a single event moves the due.
  function reschedule(t: ListTask, start: Date, end: Date | null, allDay: boolean) {
    if (t.start_date && end) {
      const due = allDay ? new Date(end.getTime() - DAY_MS) : end
      void updateTask(db, t.id, {
        start_date: allDay
          ? combineLocal(localDay(start), "", START_FALLBACK)
          : start.toISOString(),
        due_date: allDay ? combineLocal(localDay(due), "", DUE_FALLBACK) : due.toISOString(),
        due_has_time: allDay ? 0 : 1,
      })
    } else {
      void updateTask(db, t.id, {
        due_date: allDay ? combineLocal(localDay(start), "", DUE_FALLBACK) : start.toISOString(),
        due_has_time: allDay ? 0 : 1,
      })
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_15rem] gap-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          height="70vh"
          editable
          droppable
          dayMaxEvents
          events={events}
          eventClick={(info) => {
            info.jsEvent.preventDefault()
            onOpen(info.event.id)
          }}
          eventDrop={(info) => {
            const t = taskById.get(info.event.id)
            if (t) reschedule(t, info.event.start as Date, info.event.end, info.event.allDay)
          }}
          eventResize={(info) => {
            const t = taskById.get(info.event.id)
            if (t) reschedule(t, info.event.start as Date, info.event.end, info.event.allDay)
          }}
          drop={(info) => {
            const id = info.draggedEl.getAttribute("data-task-id") ?? ""
            const t = taskById.get(id)
            if (t) reschedule(t, info.date, null, info.allDay)
          }}
          // We control events from the reactive query, so drop the transient one FullCalendar
          // adds on external drop — the write re-renders the real event.
          eventReceive={(info) => info.revert()}
        />
      </div>

      <div ref={trayRef} className="rounded-xl border border-border bg-card/50 p-2">
        <p className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Unscheduled
        </p>
        <div className="flex flex-col gap-1.5">
          {unscheduled.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">Nothing unscheduled.</p>
          ) : (
            unscheduled.map((t) => (
              <button
                key={t.id}
                type="button"
                data-task-id={t.id}
                onClick={() => onOpen(t.id)}
                className="cursor-grab truncate rounded-md border border-border bg-card px-2 py-1.5 text-left text-sm active:cursor-grabbing hover:bg-accent/40"
              >
                {t.title}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
