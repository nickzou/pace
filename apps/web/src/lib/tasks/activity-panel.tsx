import { type ActivityEntry, describeActivity, formatActivityTimestamp } from "@pace/api-client"
import { useQuery } from "@powersync/react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"

// How many entries to load per page; "Show more" pulls the next page.
const PAGE = 20

// Task activity history (P3-08). Reads the task's append-only feed live from local SQLite,
// newest-first, and renders each entry as a humanised line + a timestamp in the user's zone.
//
// Two layouts share this one component (per the wireframes): on narrow (mobile/modal) it's a
// `collapsible` section that defaults closed; at `lg` the detail view renders it in a persistent
// right-hand column, always open. Only the header/expand differs — the list is identical.
export function ActivityPanel({
  taskId,
  collapsible = false,
}: {
  taskId: string
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(!collapsible)
  const [limit, setLimit] = useState(PAGE)

  // The user's timezone (P2-08) for date formatting; fall back to the browser's zone.
  const { data: settings } = useQuery<{ timezone: string | null }>(
    "SELECT timezone FROM user_settings LIMIT 1",
  )
  const tz = settings[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const { data: entries } = useQuery<ActivityEntry>(
    `SELECT id, action, field, from_value, to_value, meta, created_at
       FROM task_activity WHERE task_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ?`,
    [taskId, limit],
  )
  const hasMore = entries.length === limit

  const list =
    entries.length === 0 ? (
      <p className="px-1 py-2 text-sm text-muted-foreground">No activity yet</p>
    ) : (
      <ul className="space-y-2.5">
        {entries.map((e) => (
          <li key={e.id} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{describeActivity(e, tz)}</p>
              <p className="text-xs text-muted-foreground">
                {formatActivityTimestamp(e.created_at, tz)}
              </p>
            </div>
          </li>
        ))}
        {hasMore ? (
          <li>
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="text-xs font-medium text-muted-foreground transition hover:text-foreground hover:underline"
            >
              Show more
            </button>
          </li>
        ) : null}
      </ul>
    )

  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between"
        >
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Activity
          </h3>
          {open ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>
      ) : (
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Activity
        </h3>
      )}

      {open ? list : null}
    </section>
  )
}
