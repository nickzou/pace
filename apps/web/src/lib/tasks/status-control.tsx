import { type StatusColor, statusColor, statusColorLight } from "@pace/tokens"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu"
import { useTheme } from "#/lib/theme"
import { cn } from "#/lib/utils"

// A status as the UI reads it from local SQLite.
export type StatusOption = {
  id: string
  name: string
  color: string // a STATUS_COLORS key
  category: string // 'open' | 'in_progress' | 'done'
}

// Resolve a palette key to a hex for the active theme (P2-03 statusPalette).
export function statusHex(key: string, theme: "dark" | "light"): string {
  const map = theme === "light" ? statusColorLight : statusColor
  return map[key as StatusColor] ?? map.slate
}

// The web/desktop status control: a coloured chip with the label that opens a menu of the
// task's group statuses. Selecting one calls onSelect. (Mobile uses a coloured icon
// instead — see apps/mobile.) Built on the Radix dropdown so the menu is portalled to the
// body — it isn't clipped by a scrolling/overflow-hidden ancestor in the list view.
export function StatusControl({
  current,
  options,
  onSelect,
}: {
  current: StatusOption | undefined
  options: StatusOption[]
  onSelect: (statusId: string) => void
}) {
  const { theme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex max-w-40 shrink-0 items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: statusHex(current?.color ?? "slate", theme) }}
      >
        {current?.name ?? "—"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {options.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => onSelect(o.id)}
            className={cn(o.id === current?.id && "bg-accent/60")}
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: statusHex(o.color, theme) }}
            />
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
