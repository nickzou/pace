import { CalendarDays, Columns3, List, type LucideIcon, Table2 } from "lucide-react"
import { cn } from "#/lib/utils"
import { LAYOUTS, type Layout } from "./filter"

// The Multiview switcher (P2-07): a segmented control that flips the presentation `layout`
// (list / table / calendar / board). Purely a URL-param setter — the caller persists the choice.
const ICONS: Record<Layout, LucideIcon> = {
  list: List,
  table: Table2,
  calendar: CalendarDays,
  board: Columns3,
}
const LABELS: Record<Layout, string> = {
  list: "List",
  table: "Table",
  calendar: "Calendar",
  board: "Board",
}

export function LayoutSwitcher({
  current,
  onChange,
}: {
  current: Layout
  onChange: (layout: Layout) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="View layout"
      className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
    >
      {LAYOUTS.map((l) => {
        const Icon = ICONS[l]
        const active = l === current
        return (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={LABELS[l]}
            title={LABELS[l]}
            onClick={() => onChange(l)}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="hidden md:inline">{LABELS[l]}</span>
          </button>
        )
      })}
    </div>
  )
}
