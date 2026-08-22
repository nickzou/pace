import { presetDueDays } from "@pace/validation"
import { Calendar as CalendarIcon } from "lucide-react"
import { useState } from "react"
import { Calendar } from "#/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover"
import { cn } from "#/lib/utils"

// The date+time field for scheduling (P2-08 · R5). The value lives in a real, labelled
// <input type="date"> — keyboard-friendly, accessible, and what the e2e drives — augmented with a
// calendar-icon button that opens a battle-tested react-day-picker popover for point-and-click. Both
// paths write through the same onChange. The time input sits alongside (optional; date-only is fine).
const pad = (n: number) => String(n).padStart(2, "0")
const dayToDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y as number, (m as number) - 1, d as number)
}
const dateToDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function DatePickerField({
  day,
  time,
  onChange,
  dateAriaLabel,
  timeAriaLabel,
  fieldClass,
  showPresets = false,
}: {
  day: string
  time: string
  onChange: (day: string, time: string) => void
  dateAriaLabel: string
  timeAriaLabel: string
  fieldClass?: string
  // Show the quick-date preset chips (P2-08 · R4) under the calendar — for the due date.
  showPresets?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = day ? dayToDate(day) : undefined

  return (
    <div className="flex gap-2">
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center rounded-lg border bg-background focus-within:border-ring",
          fieldClass ?? "border-border",
        )}
      >
        <input
          type="date"
          aria-label={dateAriaLabel}
          value={day}
          onChange={(event) => onChange(event.target.value, time)}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Open ${dateAriaLabel} calendar`}
              className="px-2.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <CalendarIcon className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end">
            <Calendar
              mode="single"
              autoFocus
              selected={selected}
              defaultMonth={selected}
              onSelect={(picked) => {
                if (picked) {
                  onChange(dateToDay(picked), time)
                  setOpen(false)
                }
              }}
            />
            {showPresets ? (
              <div className="mt-1 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {presetDueDays(new Date()).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      onChange(p.day, time)
                      setOpen(false)
                    }}
                    className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
            {day ? (
              <button
                type="button"
                onClick={() => {
                  onChange("", "")
                  setOpen(false)
                }}
                className="mt-2 w-full rounded-lg px-2.5 py-1.5 text-center text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                Clear date
              </button>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
      <input
        type="time"
        aria-label={timeAriaLabel}
        value={time}
        onChange={(event) => onChange(day, event.target.value)}
        className={cn(
          "w-28 shrink-0 rounded-lg border bg-background px-2 py-2 text-sm outline-none focus:border-ring",
          fieldClass ?? "border-border",
        )}
      />
    </div>
  )
}
