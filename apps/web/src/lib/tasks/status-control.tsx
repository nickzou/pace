import { type StatusColor, statusColor, statusColorLight } from "@pace/tokens"
import { useEffect, useRef, useState } from "react"
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

// The web/desktop status control: a coloured chip with the label that opens a small menu
// of the task's group statuses. Selecting one calls onSelect. (Mobile uses a coloured
// icon instead — see apps/mobile.) Lightweight dropdown: closes on outside-click/Escape.
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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex max-w-40 items-center gap-1.5 truncate rounded-full px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: statusHex(current?.color ?? "slate", theme) }}
      >
        {current?.name ?? "—"}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(o.id)
                setOpen(false)
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                o.id === current?.id && "bg-accent/60",
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: statusHex(o.color, theme) }}
              />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
