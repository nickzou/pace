import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
// The library's base layout CSS; colours/sizing are re-themed to our tokens in styles.css
// (see the `.rdp-root` block). Kept as the picker's own stylesheet so upgrades stay drop-in.
import "react-day-picker/style.css"
import { cn } from "#/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

// A thin wrapper over react-day-picker (P2-08 · R5) — a battle-tested calendar for the date fields.
// Only ever mounts inside a Popover (client-only), so it never enters the server render.
export function Calendar({ className, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(className)}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          ),
      }}
      {...props}
    />
  )
}
