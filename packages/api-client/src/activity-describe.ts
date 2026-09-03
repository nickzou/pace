import type { ActivityAction, ActivityMeta } from "./activity-log"

// Rendering the activity feed (P3-08) — SHARED, presentation-only helpers so web and mobile
// read a task's history identically. Pure functions (no UI, no React): they turn a stored
// activity row into a human sentence + a timestamp, formatted in the user's timezone.

// The local-SQLite shape of an activity row the feed reads (meta arrives as a JSON string).
export type ActivityEntry = {
  id: string
  action: ActivityAction
  field: string | null
  from_value: string | null
  to_value: string | null
  meta: string | null
  created_at: string
}

function parseMeta(raw: string | null): ActivityMeta {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as ActivityMeta
  } catch {
    return {}
  }
}

// A date value (start/due) in the user's zone — e.g. "Sep 3, 2026". null when the value is
// unset/unparseable.
function fmtDate(iso: string | null, tz: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d)
}

// The entry's own timestamp — e.g. "Sep 3 at 2:58 PM" — in the user's zone.
export function formatActivityTimestamp(iso: string, tz: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  }).format(d)
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(d)
  return `${date} at ${time}`
}

// Turn one activity row into a human sentence. Dates are rendered in `tz`; status/tag labels
// come from the row's own `meta` snapshot, so an entry still reads correctly after the status
// or tag it references is later renamed or deleted.
export function describeActivity(entry: ActivityEntry, tz: string): string {
  const meta = parseMeta(entry.meta)
  switch (entry.action) {
    case "created":
      return "Created this task"
    case "title_changed":
      return entry.to_value ? `Renamed to "${entry.to_value}"` : "Changed the title"
    case "description_changed":
      return "Edited the description"
    case "status_changed": {
      const to = meta.toStatus
      const from = meta.fromStatus
      const label = to?.name ?? entry.to_value ?? "a new status"
      if (to?.category === "done") return `Marked done — ${label}`
      if (from?.category === "done" && to && to.category !== "done") return `Reopened — ${label}`
      return `Changed status to ${label}`
    }
    case "start_changed": {
      const to = fmtDate(entry.to_value, tz)
      if (!to) return "Cleared the start date"
      return entry.from_value ? `Moved the start date to ${to}` : `Set the start date to ${to}`
    }
    case "due_changed": {
      const to = fmtDate(entry.to_value, tz)
      if (!to) return "Cleared the due date"
      return entry.from_value ? `Rescheduled the due date to ${to}` : `Set the due date to ${to}`
    }
    case "reparented":
      return meta.toParentTitle ? `Moved under "${meta.toParentTitle}"` : "Moved to top level"
    case "recurrence_changed":
      if (!entry.to_value) return "Turned off repeat"
      return entry.from_value ? "Changed the repeat rule" : "Turned on repeat"
    case "tags_changed": {
      const name = meta.tag?.name ?? "a tag"
      return entry.field === "removed" ? `Removed tag ${name}` : `Added tag ${name}`
    }
    case "deleted":
      return "Deleted this task"
    case "restored":
      return "Restored this task"
    default:
      return "Updated the task"
  }
}
