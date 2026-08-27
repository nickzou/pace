import { describe, monthlyRuleBody, withAnchor } from "@pace/validation"
import { usePowerSync, useQuery } from "@powersync/react"
import { setTaskRecurrence } from "#/lib/tasks/mutations"

// The "Repeat" control in the task detail (P2-08). A frequency picker + an on-completion mode, over
// the shared recurrence engine. Anchored to the task's due date in the device's timezone (the same
// zone TimezoneSync records for the server). A repeat needs a due date, so without one it just
// prompts for it.
const FREQS = [
  { key: "none", label: "Doesn't repeat" },
  { key: "daily", label: "Daily" },
  { key: "weekdays", label: "Every weekday (Mon–Fri)" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
] as const

const SELECT_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"

// Frequency key → RRULE body, anchored later by withAnchor.
function bodyFor(freq: string, dueIso: string, tz: string): string | null {
  switch (freq) {
    case "daily":
      return "FREQ=DAILY"
    case "weekdays":
      return "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"
    case "weekly":
      return "FREQ=WEEKLY"
    case "biweekly":
      return "FREQ=WEEKLY;INTERVAL=2"
    case "monthly":
      return monthlyRuleBody(dueIso, tz)
    case "yearly":
      return "FREQ=YEARLY"
    default:
      return null
  }
}

// Best-effort read of the stored rule back to a dropdown key (to reflect current state).
function freqOf(rule: string | null): string {
  if (!rule) return "none"
  if (rule.includes("FREQ=DAILY"))
    return rule.includes("BYDAY=MO,TU,WE,TH,FR") ? "weekdays" : "daily"
  if (rule.includes("FREQ=WEEKLY")) return rule.includes("INTERVAL=2") ? "biweekly" : "weekly"
  if (rule.includes("FREQ=MONTHLY")) return "monthly"
  if (rule.includes("FREQ=YEARLY")) return "yearly"
  return "none"
}

export function RecurrenceControl({ taskId }: { taskId: string }) {
  // Read this task's recurrence straight from local SQLite — PowerSync is the state layer, so the
  // control stays self-contained (only a taskId) and reflects edits reactively without prop-drilling.
  const db = usePowerSync()
  const { data: rows } = useQuery<{
    due_date: string | null
    recurrence: string | null
    recurrence_regen: string | null
  }>("SELECT due_date, recurrence, recurrence_regen FROM tasks WHERE id = ?", [taskId])
  const row = rows[0]
  const dueIso = row?.due_date ?? null
  const recurrence = row?.recurrence ?? null
  const recurrenceRegen = row?.recurrence_regen ?? null

  if (!dueIso) {
    return (
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>Repeat</span>
        <span className="rounded-lg border border-dashed border-border px-3 py-2 text-sm">
          Set a due date to make this task repeat.
        </span>
      </div>
    )
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const freq = freqOf(recurrence)
  const regen = recurrenceRegen === "duplicate" ? "duplicate" : "advance"

  const changeFreq = (f: string) => {
    const body = bodyFor(f, dueIso, tz)
    if (!body) void setTaskRecurrence(db, taskId, null, null)
    else void setTaskRecurrence(db, taskId, withAnchor(body, dueIso, tz), regen)
  }
  const changeRegen = (r: "advance" | "duplicate") => {
    if (recurrence) void setTaskRecurrence(db, taskId, recurrence, r)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Repeat
        <select
          aria-label="Repeat frequency"
          value={freq}
          onChange={(e) => changeFreq(e.target.value)}
          className={SELECT_CLASS}
        >
          {FREQS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      {recurrence ? (
        <>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            When completed
            <select
              aria-label="On completion"
              value={regen}
              onChange={(e) => changeRegen(e.target.value as "advance" | "duplicate")}
              className={SELECT_CLASS}
            >
              <option value="advance">Reschedule this task to the next date</option>
              <option value="duplicate">Keep it done, create the next task</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">Repeats {describe(recurrence)}.</p>
        </>
      ) : null}
    </div>
  )
}
