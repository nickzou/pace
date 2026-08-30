import { detectTimezone, timezoneList, timezoneOffsetLabel } from "@pace/validation"
import { usePowerSync, useQuery } from "@powersync/react"
import { Check, ChevronsUpDown } from "lucide-react"
import { useMemo, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "#/components/ui/popover"
import { Switch } from "#/components/ui/switch"
import { cn } from "#/lib/utils"
import { setTimezone } from "./mutations"

const ALL_ZONES = timezoneList()

// A friendly one-line label for a zone: "America/Toronto — GMT-4".
function zoneLabel(zone: string): string {
  const offset = timezoneOffsetLabel(zone)
  return offset ? `${zone.replace(/_/g, " ")} — ${offset}` : zone.replace(/_/g, " ")
}

// The Settings "Timezone" section (P2 Timezones). Auto-detects by default (see TimezoneSync);
// this lets the user pin a specific IANA zone, which turns auto-detection off. The stored zone
// drives due/start-date calc and recurrence across the app. Reads/writes live SQLite like the
// other settings; writes replay through the connector's partial settings.set.
export function TimezoneSettings() {
  const db = usePowerSync()
  const { data } = useQuery<{ id: string; timezone: string | null; timezone_auto: number }>(
    "SELECT id, timezone, timezone_auto FROM user_settings LIMIT 1",
  )
  const row = data[0]
  const auto = row ? row.timezone_auto !== 0 : true
  const current = row?.timezone ?? detectTimezone()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? ALL_ZONES.filter((z) => z.toLowerCase().includes(q)) : ALL_ZONES
    return list.slice(0, 200)
  }, [query])

  function pick(zone: string) {
    if (!row) return
    void setTimezone(db, row.id, zone, false) // pinning turns auto-detection off
    setOpen(false)
    setQuery("")
  }

  function toggleAuto(next: boolean) {
    if (!row) return
    // On → re-detect + keep auto on. Off → pin whatever's showing now.
    void setTimezone(db, row.id, next ? detectTimezone() : current, next)
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-glow">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Timezone
      </h2>

      <div className="flex items-center justify-between gap-4 text-sm">
        <div className="min-w-0">
          <div className="text-muted-foreground">Auto-detect</div>
          <div className="text-xs text-muted-foreground/70">Follow this device's timezone.</div>
        </div>
        <Switch
          aria-label="Auto-detect timezone"
          disabled={!row}
          checked={auto}
          onCheckedChange={toggleAuto}
        />
      </div>

      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="shrink-0 text-muted-foreground">Timezone</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={!row}
              aria-label="Timezone"
              className="flex min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 py-1.5 text-right outline-none focus:border-ring disabled:opacity-50"
            >
              <span className="truncate">{zoneLabel(current)}</span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0">
            {/* Radix focuses the first focusable child (this input) on open, so no autoFocus. */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search timezones…"
              className="w-full border-b border-border bg-transparent px-3 py-2 text-sm outline-none"
            />
            <ul className="max-h-64 overflow-auto p-1">
              {matches.map((z) => (
                <li key={z}>
                  <button
                    type="button"
                    onClick={() => pick(z)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Check
                      className={cn("size-4 shrink-0", z === current ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{zoneLabel(z)}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 ? (
                <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
              ) : null}
            </ul>
          </PopoverContent>
        </Popover>
      </div>

      <p className="text-xs text-muted-foreground">
        Used for due dates, start dates, and recurring tasks.
      </p>
    </section>
  )
}
