import { RRule, rrulestr } from "rrule"

// P2-08 recurrence engine — a thin, timezone-correct wrapper over `rrule`.
//
// The app stores dates as UTC instants, but a repeat is about the user's LOCAL calendar day (a
// date-only due is 23:59 *local*), so every function takes an IANA `tz`. `rrule` is UTC-naive: it
// reasons over a Date's UTC fields. So we feed it "fake UTC" dates whose UTC fields equal the local
// wall-clock, let it advance, then convert the fields back to a real UTC instant in `tz`. This keeps
// a date-only weekly repeat on the same local day across a DST change (a raw +7d in UTC would slip
// 23:59 to 00:59 the next day at a spring-forward).
//
// The stored rule carries a fixed `DTSTART` — the fake-UTC of the LOCAL due wall-clock at the moment
// recurrence was set (see `withAnchor`). We compute the *next* occurrence as `rule.after(currentDue)`
// rather than re-anchoring to the current due, so COUNT ("after N times") and UNTIL both reason from
// that stable origin and exhaust correctly as the task marches forward.

type LocalFields = { y: number; mo: number; d: number; h: number; min: number }

// The offset (minutes ahead of UTC) of `tz` at a given instant.
function tzOffsetMinutes(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return (asUtc - instant.getTime()) / 60000
}

// UTC ISO → the wall-clock fields a viewer in `tz` sees.
function toLocalFields(iso: string, tz: string): LocalFields {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(new Date(iso))) p[part.type] = part.value
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, min: +p.minute }
}

// Local wall-clock fields in `tz` → the real UTC instant. DST-correct: solve for the offset at the
// target local time, then re-solve once if the resolved instant landed on the other side of a jump.
function fromLocalFields(f: LocalFields, tz: string): Date {
  const guess = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.min)
  const off1 = tzOffsetMinutes(new Date(guess), tz)
  const utc1 = guess - off1 * 60000
  const off2 = tzOffsetMinutes(new Date(utc1), tz)
  return off2 === off1 ? new Date(utc1) : new Date(guess - off2 * 60000)
}

// A "fake UTC" Date whose UTC fields equal the given local fields (the frame rrule reasons over).
function toFakeUtc(f: LocalFields): Date {
  return new Date(Date.UTC(f.y, f.mo - 1, f.d, f.h, f.min))
}
function fromFakeUtc(d: Date): LocalFields {
  return {
    y: d.getUTCFullYear(),
    mo: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
  }
}
const pad2 = (n: number) => String(n).padStart(2, "0")

// Parse a stored rule (DTSTART + RRULE) to a single RRule. Throws on a rule set or garbage.
function parse(rule: string): RRule {
  const r = rrulestr(rule)
  if (!(r instanceof RRule)) throw new Error("expected a single RRULE")
  return r
}

// Compose a storable rule: an RRULE body (e.g. "FREQ=WEEKLY;INTERVAL=2") anchored to the due date's
// LOCAL wall-clock as a fake-UTC DTSTART. Everything downstream reasons from this fixed origin, so
// BYDAY, COUNT, and UNTIL are all stable and tz-correct. Called by the editor when a rule is set.
export function withAnchor(rruleBody: string, dueIso: string, tz: string): string {
  const f = toLocalFields(dueIso, tz)
  const dt = `${f.y}${pad2(f.mo)}${pad2(f.d)}T${pad2(f.h)}${pad2(f.min)}00Z`
  return `DTSTART:${dt}\nRRULE:${rruleBody}`
}

// The RRULE body for a plain "monthly" repeat, applying the clamp most apps do (iOS Reminders,
// Todoist): if the due is the LAST day of its month (Jan 31, Feb 28, Apr 30…), it recurs on the last
// day of every month (BYMONTHDAY=-1) so it never skips a short month; otherwise it's the same
// day-of-month. (A bare FREQ=MONTHLY on the 31st would skip Feb/Apr/Jun/Sep/Nov — surprising.)
export function monthlyRuleBody(dueIso: string, tz: string): string {
  const f = toLocalFields(dueIso, tz)
  const lastDay = new Date(Date.UTC(f.y, f.mo, 0)).getUTCDate() // day 0 of next month = last of this
  return f.d === lastDay ? "FREQ=MONTHLY;BYMONTHDAY=-1" : "FREQ=MONTHLY"
}

// Is `rule` a parseable single RRULE? Used by the setRecurrence guard (P2-08 step 3).
export function isValidRule(rule: string): boolean {
  try {
    return parse(rule).options.freq != null
  } catch {
    return false
  }
}

// A human-readable summary, e.g. "every 2 weeks on Monday, Wednesday". Empty string on a bad rule.
export function describe(rule: string): string {
  try {
    return parse(rule).toText()
  } catch {
    return ""
  }
}

// The next occurrence strictly after `dueIso` (UTC ISO), or null when the rule is exhausted (past its
// COUNT / UNTIL). Preserves the local time-of-day.
export function nextOccurrence(rule: string, dueIso: string, tz: string): string | null {
  const next = parse(rule).after(toFakeUtc(toLocalFields(dueIso, tz)), false)
  return next ? fromLocalFields(fromFakeUtc(next), tz).toISOString() : null
}

// Occurrences of a repeating task within a visible window (UTC ISO bounds), for calendar ghosts —
// strictly AFTER the current due (that one is the real event, not a ghost).
export function occurrencesBetween(
  rule: string,
  dueIso: string,
  windowStartIso: string,
  windowEndIso: string,
  tz: string,
): string[] {
  const r = parse(rule)
  const start = toFakeUtc(toLocalFields(windowStartIso, tz))
  const end = toFakeUtc(toLocalFields(windowEndIso, tz))
  const dueMs = toFakeUtc(toLocalFields(dueIso, tz)).getTime()
  return r
    .between(start, end, true)
    .filter((d) => d.getTime() > dueMs)
    .map((d) => fromLocalFields(fromFakeUtc(d), tz).toISOString())
}

// Whole local calendar days between two instants (b − a), for shifting a range's start end.
function localDaysBetween(aIso: string, bIso: string, tz: string): number {
  const a = toLocalFields(aIso, tz)
  const b = toLocalFields(bIso, tz)
  return Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 86_400_000)
}

// Shift an instant by `n` local calendar days, preserving its local time-of-day.
function addLocalDays(iso: string, n: number, tz: string): string {
  const f = toLocalFields(iso, tz)
  const shifted = fromFakeUtc(new Date(Date.UTC(f.y, f.mo - 1, f.d + n, f.h, f.min)))
  return fromLocalFields(shifted, tz).toISOString()
}

// Advance a task's whole schedule to its next occurrence (P2-08 generation). The due date follows
// the rule; a range's start shifts by the same number of local days, preserving the span. Returns
// null when the rule is exhausted.
export function advanceSchedule(
  rule: string,
  dueIso: string,
  startIso: string | null,
  tz: string,
): { dueIso: string; startIso: string | null } | null {
  const nextDue = nextOccurrence(rule, dueIso, tz)
  if (!nextDue) return null
  if (!startIso) return { dueIso: nextDue, startIso: null }
  const days = localDaysBetween(dueIso, nextDue, tz)
  return { dueIso: nextDue, startIso: addLocalDays(startIso, days, tz) }
}
