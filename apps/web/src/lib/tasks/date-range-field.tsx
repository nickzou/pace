import { presetDueDays } from "@pace/validation"
import { Calendar as CalendarIcon } from "lucide-react"
import { useState } from "react"
import type { DateRange } from "react-day-picker"
import { Calendar } from "#/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover"
import { formatDayLabel, formatMonthDay } from "#/lib/tasks/dates"
import { cn } from "#/lib/utils"

// The task's schedule as ONE control (Fix Date Selector). A single styled button shows the
// state — placeholder / a due date / a start→due range — and opens a react-day-picker RANGE
// popover with optional per-end times and the quick-date presets. It replaces the old
// input-plus-icon field, whose native <input type="date"> indicator couldn't be hidden
// cross-browser and left two calendar icons side by side.
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
}: {
  startDay: string
  startTime: string
  dueDay: string
  dueTime: string
  onChangeStart: (day: string, time: string) => void
  onChangeDue: (day: string, time: string) => void
  // Overdue/today border tint from the caller (dueDayState) — mirrors the old fieldClass.
  buttonClass?: string
}) {
  const [open, setOpen] = useState(false)

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
    const from = range?.from ? dateToDay(range.from) : ""
    const to = range?.to ? dateToDay(range.to) : ""
    if (from && to) {
      // Two ends → a range: earlier is the start, later is the due date.
      onChangeStart(from, startTime)
      onChangeDue(to, dueTime)
    } else if (from) {
      // A single pick is the DUE date; no separate start.
      onChangeStart("", "")
      onChangeDue(from, dueTime)
    } else {
      onChangeStart("", "")
      onChangeDue("", "")
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <div className="flex gap-4">
          <Calendar
            mode="range"
            autoFocus
            selected={selected}
            defaultMonth={selected?.from}
            onSelect={selectRange}
          />

          {/* Quick-date presets fill the space beside the calendar — each sets the DUE
              date, leaving any start in place. */}
          <div className="flex flex-col gap-1.5 self-start">
            {presetDueDays(new Date()).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChangeDue(p.day, dueTime)
                  setOpen(false)
                }}
                className="rounded-full border border-border px-2.5 py-1 text-center text-[11px] text-muted-foreground transition-all duration-200 ease-out hover:scale-105 hover:border-ring hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
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
      </PopoverContent>
    </Popover>
  )
}
