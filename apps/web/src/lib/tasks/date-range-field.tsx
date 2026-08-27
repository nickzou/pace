import { presetDueDays, resolveScheduleRange } from "@pace/validation"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Calendar as CalendarIcon } from "lucide-react"
import { lazy, Suspense, useState } from "react"
import type { DateRange } from "react-day-picker"
import { Calendar } from "#/components/ui/calendar"
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover"
import { formatDayLabel, formatMonthDay } from "#/lib/tasks/dates"
import { useMediaQuery } from "#/lib/use-media-query"
import { cn } from "#/lib/utils"

// Lazy, and NOT just for bundle size: RecurrenceControl pulls in rrule (a CommonJS module whose
// ESM-default interop breaks under the SSR build). A static import drags rrule into task-detail's
// server bundle and crashes renderToReadableStream, so it must stay behind a dynamic import —
// keeping rrule client-only. Loads with the popover, which only opens on demand (P2-08).
const RecurrenceControl = lazy(() =>
  import("#/lib/tasks/recurrence-control").then((m) => ({ default: m.RecurrenceControl })),
)

// The task's schedule as ONE control (Fix Date Selector). A single styled button shows the
// state — placeholder / a due date / a start→due range — and opens a react-day-picker RANGE
// picker with optional per-end times, the quick-date presets, and the Repeat control. It
// replaces the old input-plus-icon field, whose native <input type="date"> indicator couldn't
// be hidden cross-browser and left two calendar icons side by side.
//
// Presentation is responsive: an anchored popover on desktop, a bottom sheet on phones —
// the popover's two-column content is wider/taller than a ~375px viewport, so it overflowed
// sideways and off the top. The same body renders in both; because the sheet only mounts
// below 640px and the popover only at/above it, the `sm:` layout classes (stacked vs. side by
// side) resolve correctly inside each wrapper off the one Tailwind breakpoint.
//
// Model: start_date/due_date already exist as two timestamps, so the range maps cleanly —
// from → start, to → due. A single pick is a DUE date (the common case), matching the
// "Due Date" placeholder; picking a second, later day turns it into a range.
const pad = (n: number) => String(n).padStart(2, "0")
const dayToDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y as number, (m as number) - 1, d as number)
}
const dateToDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function DateRangeField({
  startDay,
  startTime,
  dueDay,
  dueTime,
  onChangeStart,
  onChangeDue,
  buttonClass,
  taskId,
}: {
  startDay: string
  startTime: string
  dueDay: string
  dueTime: string
  onChangeStart: (day: string, time: string) => void
  onChangeDue: (day: string, time: string) => void
  // Overdue/today border tint from the caller (dueDayState) — mirrors the old fieldClass.
  buttonClass?: string
  // Renders the Repeat control below the times; it reads its own row by id.
  taskId: string
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 640px)")

  // Reflect the stored start/due into a react-day-picker range. Due-only shows a single
  // selected day (from, no to); a full range shows both ends.
  const selected: DateRange | undefined =
    startDay && dueDay
      ? { from: dayToDate(startDay), to: dayToDate(dueDay) }
      : dueDay
        ? { from: dayToDate(dueDay), to: undefined }
        : startDay
          ? { from: dayToDate(startDay), to: undefined }
          : undefined

  const hasAny = startDay || dueDay
  const isRange = startDay && dueDay && startDay !== dueDay
  const label = !hasAny
    ? "Due Date"
    : isRange
      ? `${formatMonthDay(startDay)} → ${formatMonthDay(dueDay)}`
      : // one end only (or start === due) → the single-date form
        formatDayLabel(dueDay || startDay, dueDay ? dueTime : startTime)

  const selectRange = (range: DateRange | undefined) => {
    // Range → (start, due) is the shared flow rule (single = due, distinct days = range, same day
    // twice = single due) — see resolveScheduleRange, used by mobile too so the two can't drift.
    const { start, due } = resolveScheduleRange(
      range?.from ? dateToDay(range.from) : "",
      range?.to ? dateToDay(range.to) : "",
    )
    onChangeStart(start, start ? startTime : "")
    onChangeDue(due, due ? dueTime : "")
  }

  const today = new Date()
  const todayDay = dateToDay(today)

  // Least-friction default: opening the picker on an empty field sets the due date to TODAY right
  // away (the common case), so it's already chosen and the calendar centres on it. Adjusting from
  // there is a normal pick; Clear removes it. Only fires when nothing is set yet.
  const handleOpenChange = (next: boolean) => {
    if (next && !hasAny) onChangeDue(todayDay, dueTime)
    setOpen(next)
  }

  const trigger = (
    <button
      type="button"
      aria-label="Due date"
      data-testid="due-date-button"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left text-sm outline-none transition-colors duration-200 ease-out hover:border-ring hover:bg-accent/40 focus-visible:border-ring",
        buttonClass ?? "border-border",
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
        <CalendarIcon className="size-3.5" />
      </span>
      <span className={cn("min-w-0 flex-1 truncate", !hasAny && "text-muted-foreground")}>
        {label}
      </span>
    </button>
  )

  // Shared body. Stacks on phones (in the sheet) and sits side by side on desktop (in the
  // popover) via `sm:` — see the responsive note above.
  const body = (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <Calendar
          mode="range"
          autoFocus
          selected={selected}
          defaultMonth={selected?.from ?? today}
          onSelect={selectRange}
          className="mx-auto sm:mx-0"
        />

        {/* Quick-date presets — each sets the DUE date, leaving any start in place. Today/Tomorrow
            are the common picks, so they get a primary tint to stand out from the muted rest. They
            wrap in a row on phones, and stack in a column beside the calendar on desktop. */}
        <div className="flex flex-wrap gap-1.5 sm:flex-col sm:self-start">
          {presetDueDays(new Date()).map((p) => {
            const emphasized = p.key === "today" || p.key === "tomorrow"
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChangeDue(p.day, dueTime)
                  setOpen(false)
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-center text-[11px] transition-all duration-200 ease-out hover:scale-105 hover:border-ring hover:text-foreground",
                  emphasized
                    ? "border-primary/40 bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Optional per-end times — kept out of the button per the mockup, editable here. */}
      {startDay || dueDay ? (
        <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
          {startDay ? (
            <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              Start time
              <input
                type="time"
                aria-label="Start time"
                value={startTime}
                onChange={(event) => onChangeStart(startDay, event.target.value)}
                className="w-28 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring"
              />
            </label>
          ) : null}
          {dueDay ? (
            <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              Due time
              <input
                type="time"
                aria-label="Due time"
                value={dueTime}
                onChange={(event) => onChangeDue(dueDay, event.target.value)}
                className="w-28 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring"
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 border-t border-border pt-3">
        <Suspense fallback={null}>
          <RecurrenceControl taskId={taskId} />
        </Suspense>
      </div>

      {hasAny ? (
        <button
          type="button"
          onClick={() => {
            onChangeStart("", "")
            onChangeDue("", "")
            setOpen(false)
          }}
          className="mt-2 w-full rounded-lg px-2.5 py-1.5 text-center text-xs text-muted-foreground transition-colors duration-200 ease-out hover:text-destructive"
        >
          Clear dates
        </button>
      ) : null}
    </>
  )

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-auto">
          {body}
        </PopoverContent>
      </Popover>
    )
  }

  // Phones: a bottom sheet instead of the anchored popover — full width, height-capped with
  // scroll, sliding up from the bottom. Built from the Radix Dialog primitives (reusing the app's
  // themed overlay) rather than the centered DialogContent, so it anchors to the bottom edge.
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[94dvh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-popover p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          )}
        >
          <DialogTitle className="sr-only">Schedule</DialogTitle>
          {/* Grab-handle affordance for the sheet. */}
          <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-border" />
          {body}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground transition-colors duration-200 ease-out hover:bg-primary/90"
          >
            Done
          </button>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
