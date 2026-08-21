import { describe, expect, it } from "vitest"
import {
  advanceSchedule,
  describe as describeRule,
  isValidRule,
  monthlyRuleBody,
  nextOccurrence,
  occurrencesBetween,
  withAnchor,
} from "./recurrence"

const NY = "America/New_York"

// --- test helpers: build a UTC ISO for a given LOCAL wall-clock, and read a local day/time back ---
function offset(instant: Date, tz: string): number {
  const p: Record<string, string> = {}
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant))
    p[part.type] = part.value
  return (
    (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - instant.getTime()) /
    60000
  )
}
function utcFromLocal(tz: string, y: number, mo: number, d: number, h = 0, min = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, min)
  const o1 = offset(new Date(guess), tz)
  const u1 = guess - o1 * 60000
  const o2 = offset(new Date(u1), tz)
  return new Date(o2 === o1 ? u1 : guess - o2 * 60000).toISOString()
}
const localDay = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso))
const localHM = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))

describe("nextOccurrence — cadence", () => {
  it("advances daily, preserving the local time-of-day", () => {
    const due = utcFromLocal(NY, 2026, 8, 15, 9, 0)
    const rule = withAnchor("FREQ=DAILY", due, NY)
    const next = nextOccurrence(rule, due, NY) as string
    expect(localDay(next, NY)).toBe("2026-08-16")
    expect(localHM(next, NY)).toBe("09:00")
  })

  it("advances weekly and biweekly by 7 / 14 local days", () => {
    const due = utcFromLocal(NY, 2026, 8, 15, 23, 59) // Sat
    expect(
      localDay(nextOccurrence(withAnchor("FREQ=WEEKLY", due, NY), due, NY) as string, NY),
    ).toBe("2026-08-22")
    expect(
      localDay(
        nextOccurrence(withAnchor("FREQ=WEEKLY;INTERVAL=2", due, NY), due, NY) as string,
        NY,
      ),
    ).toBe("2026-08-29")
  })

  it("handles 'twice a week' (BYDAY=MO,WE): Mon → Wed → next Mon", () => {
    const mon = utcFromLocal(NY, 2026, 8, 3, 9, 0) // Aug 3 2026 is a Monday
    const rule = withAnchor("FREQ=WEEKLY;BYDAY=MO,WE", mon, NY)
    const wed = nextOccurrence(rule, mon, NY) as string
    expect(localDay(wed, NY)).toBe("2026-08-05")
    expect(localDay(nextOccurrence(rule, wed, NY) as string, NY)).toBe("2026-08-10") // next Monday
  })

  it("skip-weekends daily (BYDAY=MO..FR): Friday → Monday", () => {
    const fri = utcFromLocal(NY, 2026, 8, 7, 8, 0) // Aug 7 2026 is a Friday
    const rule = withAnchor("FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR", fri, NY)
    expect(localDay(nextOccurrence(rule, fri, NY) as string, NY)).toBe("2026-08-10") // Monday
  })

  it("monthly clamps end-of-month via monthlyRuleBody (Jan 31 → Feb 28 → Mar 31)", () => {
    const jan31 = utcFromLocal(NY, 2026, 1, 31, 9, 0)
    const rule = withAnchor(monthlyRuleBody(jan31, NY), jan31, NY) // last-day anchor → BYMONTHDAY=-1
    const feb = nextOccurrence(rule, jan31, NY) as string
    expect(localDay(feb, NY)).toBe("2026-02-28") // clamped, not skipped
    expect(localDay(nextOccurrence(rule, feb, NY) as string, NY)).toBe("2026-03-31")
    // A mid-month day just repeats on the same day.
    const jan15 = utcFromLocal(NY, 2026, 1, 15, 9, 0)
    const rule15 = withAnchor(monthlyRuleBody(jan15, NY), jan15, NY)
    expect(localDay(nextOccurrence(rule15, jan15, NY) as string, NY)).toBe("2026-02-15")
  })
})

describe("nextOccurrence — timezone / DST", () => {
  it("keeps a date-only weekly repeat on the same local day+time across a spring-forward", () => {
    // US DST 2026 springs forward on Sun Mar 8. A 23:59 date-only repeat must stay 23:59 on Mar 8,
    // not slip to 00:59 Mar 9 (which a raw +7d in UTC would do).
    const before = utcFromLocal(NY, 2026, 3, 1, 23, 59)
    const next = nextOccurrence(withAnchor("FREQ=WEEKLY", before, NY), before, NY) as string
    expect(localDay(next, NY)).toBe("2026-03-08")
    expect(localHM(next, NY)).toBe("23:59")
  })

  it("daily across the spring-forward day stays on the correct local day", () => {
    const mar7 = utcFromLocal(NY, 2026, 3, 7, 23, 59)
    const next = nextOccurrence(withAnchor("FREQ=DAILY", mar7, NY), mar7, NY) as string
    expect(localDay(next, NY)).toBe("2026-03-08")
    expect(localHM(next, NY)).toBe("23:59")
  })
})

describe("nextOccurrence — end conditions", () => {
  it("exhausts after COUNT occurrences (counted from the fixed anchor, not re-anchored)", () => {
    const d0 = utcFromLocal(NY, 2026, 8, 15, 9, 0)
    const rule = withAnchor("FREQ=DAILY;COUNT=3", d0, NY) // occurrences: d0, d0+1, d0+2
    const d1 = nextOccurrence(rule, d0, NY) as string
    const d2 = nextOccurrence(rule, d1, NY) as string
    expect(localDay(d1, NY)).toBe("2026-08-16")
    expect(localDay(d2, NY)).toBe("2026-08-17")
    expect(nextOccurrence(rule, d2, NY)).toBeNull() // 3 done → exhausted
  })

  it("exhausts at an UNTIL bound", () => {
    // In UTC, fake-UTC == real UTC, so the UNTIL literal is unambiguous.
    const d0 = "2026-08-15T09:00:00.000Z"
    const rule = `DTSTART:20260815T090000Z\nRRULE:FREQ=DAILY;UNTIL=20260817T090000Z`
    const d1 = nextOccurrence(rule, d0, "UTC") as string
    expect(localDay(d1, "UTC")).toBe("2026-08-16")
    const d2 = nextOccurrence(rule, d1, "UTC") as string
    expect(localDay(d2, "UTC")).toBe("2026-08-17")
    expect(nextOccurrence(rule, d2, "UTC")).toBeNull()
  })
})

describe("occurrencesBetween — calendar ghosts", () => {
  it("returns occurrences after the current due, within the window", () => {
    const due = utcFromLocal(NY, 2026, 8, 3, 9, 0) // Mon Aug 3
    const rule = withAnchor("FREQ=WEEKLY", due, NY)
    const winStart = utcFromLocal(NY, 2026, 8, 1, 0, 0)
    const winEnd = utcFromLocal(NY, 2026, 8, 31, 23, 59)
    const ghosts = occurrencesBetween(rule, due, winStart, winEnd, NY).map((iso) =>
      localDay(iso, NY),
    )
    // The current due (Aug 3) is excluded — it's the real event, not a ghost.
    expect(ghosts).toEqual(["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"])
  })
})

describe("advanceSchedule — ranges", () => {
  it("moves both ends, preserving the span in local days", () => {
    const start = utcFromLocal(NY, 2026, 8, 13, 9, 0)
    const due = utcFromLocal(NY, 2026, 8, 15, 17, 0)
    const rule = withAnchor("FREQ=WEEKLY", due, NY)
    const advanced = advanceSchedule(rule, due, start, NY)
    expect(advanced).not.toBeNull()
    expect(localDay(advanced?.dueIso as string, NY)).toBe("2026-08-22")
    expect(localDay(advanced?.startIso as string, NY)).toBe("2026-08-20") // same 2-day span
    expect(localHM(advanced?.startIso as string, NY)).toBe("09:00")
  })

  it("returns null when the rule is exhausted", () => {
    const due = utcFromLocal(NY, 2026, 8, 15, 9, 0)
    const rule = withAnchor("FREQ=DAILY;COUNT=1", due, NY) // only the anchor
    expect(advanceSchedule(rule, due, null, NY)).toBeNull()
  })
})

describe("describe / isValidRule", () => {
  it("summarises a rule in plain English", () => {
    const due = utcFromLocal(NY, 2026, 8, 15, 9, 0)
    expect(describeRule(withAnchor("FREQ=WEEKLY;INTERVAL=2", due, NY))).toContain("every 2 weeks")
  })

  it("validates parseable rules and rejects garbage", () => {
    const due = utcFromLocal(NY, 2026, 8, 15, 9, 0)
    expect(isValidRule(withAnchor("FREQ=DAILY", due, NY))).toBe(true)
    expect(isValidRule("not a rule")).toBe(false)
    expect(isValidRule("")).toBe(false)
  })
})
