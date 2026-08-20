import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin, { Draggable } from "@fullcalendar/interaction"
import FullCalendar from "@fullcalendar/react"
import { usePowerSync } from "@powersync/react"
import { CornerDownRight, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { statusHex } from "#/lib/tasks/status-control"
import { useTheme } from "#/lib/theme"
import { cn } from "#/lib/utils"
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
  // On mobile the tray becomes a slide-out shelf (there's no room for a side column); this drives it.
  const [shelfOpen, setShelfOpen] = useState(false)

  const { events, unscheduled } = useMemo(() => {
    const unscheduled = tasks.filter((t) => !t.due_date)
    const events = tasks
      .filter((t) => t.due_date)
      .map((t) => {
        const allDay = !t.due_has_time
        const color = statusHex(t.status_color, theme)
        const due = t.due_date as string
        // Subtask marker (P2-07): a class prefixes the event title with a subtle ↳ (see styles.css).
        const classNames = t.parent_id ? ["fc-subtask"] : undefined
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
    <div className="flex gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-3">
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

      {/* Mobile: an edge handle to pull the shelf out, and a backdrop to dismiss it. */}
      {shelfOpen ? (
        <button
          type="button"
          aria-label="Close unscheduled"
          onClick={() => setShelfOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShelfOpen(true)}
          className="fixed top-1/2 right-0 z-20 -translate-y-1/2 rounded-l-lg border border-r-0 border-border bg-card px-1.5 py-3 text-xs text-muted-foreground shadow-md [writing-mode:vertical-rl] lg:hidden"
        >
          Unscheduled{unscheduled.length ? ` · ${unscheduled.length}` : ""}
        </button>
      )}

      {/* Static side column on desktop; a right-side slide-out shelf on mobile. One element, so the
          FullCalendar Draggable (trayRef) stays wired in either mode. */}
      <div
        ref={trayRef}
        className={cn(
          "rounded-xl border border-border bg-card/50 p-2 transition-transform",
          "max-lg:fixed max-lg:top-0 max-lg:right-0 max-lg:z-40 max-lg:h-full max-lg:w-64 max-lg:overflow-y-auto max-lg:rounded-none max-lg:border-y-0 max-lg:border-r-0 max-lg:bg-card max-lg:shadow-xl",
          shelfOpen ? "max-lg:translate-x-0" : "max-lg:translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Unscheduled
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShelfOpen(false)}
            className="text-muted-foreground hover:text-foreground lg:hidden [&_svg]:size-4"
          >
            <X />
          </button>
        </div>
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
                className="flex cursor-grab items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-left text-sm active:cursor-grabbing hover:bg-accent/40"
              >
                {t.parent_id ? (
                  <CornerDownRight
                    aria-label="Subtask"
                    className="size-3 shrink-0 text-muted-foreground/70"
                  />
                ) : null}
                <span className="min-w-0 truncate">{t.title}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
