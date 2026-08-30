import { describe, expect, it } from "vitest"
import {
  combineLocal,
  DUE_FALLBACK,
  dueDayState,
  formatDate,
  formatDayLabel,
  formatMonthDay,
  START_FALLBACK,
  toDateInput,
  toTimeInput,
} from "./dates"

const daysFromNow = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

// P2 Timezones: the calc helpers take an explicit account `tz` and must resolve in it, not the
// device zone. Pin the zone so the assertions are deterministic wherever the suite runs.
describe("account timezone", () => {
  it("interprets a picked wall-clock in the given zone (combineLocal ↔ toDateInput/toTimeInput)", () => {
    // 09:00 in Tokyo is the previous day 20:00 UTC / 16:00 in New York.
    const iso = combineLocal("2026-06-15", "09:00", DUE_FALLBACK, "Asia/Tokyo")
    expect(iso).toBe("2026-06-15T00:00:00.000Z")
    // Round-trips in the same zone…
    expect(toDateInput(iso, "Asia/Tokyo")).toBe("2026-06-15")
    expect(toTimeInput(iso, "Asia/Tokyo")).toBe("09:00")
    // …but reads as the prior day in New York.
    expect(toDateInput(iso, "America/New_York")).toBe("2026-06-14")
  })

  it("resolves the calendar day (which drives overdue/today) in the account zone", () => {
    // 2026-06-15 20:00 UTC lands on the 16th in Tokyo but is still the 15th in Los Angeles — the
    // day boundary dueDayState compares against differs by zone.
    const lateIso = "2026-06-15T20:00:00.000Z"
    expect(toDateInput(lateIso, "Asia/Tokyo")).toBe("2026-06-16")
    expect(toDateInput(lateIso, "America/Los_Angeles")).toBe("2026-06-15")
    // A far-past instant is "overdue" regardless of zone (sanity that the tz path still works).
    expect(dueDayState("2020-01-01T00:00:00.000Z", false, "Asia/Tokyo")).toBe("overdue")
  })
})

// These bridge stored UTC ISO ↔ the local wall-clock the pickers speak. The
// assertions are timezone-independent on purpose: they round-trip a value back
// through the local-rendering helpers rather than pin an exact UTC string, so the
// suite passes in whatever TZ it runs under.

describe("toDateInput / toTimeInput", () => {
  it("return empty strings when there is no date", () => {
    expect(toDateInput(null)).toBe("")
    expect(toTimeInput(null)).toBe("")
  })

  it("render a stored instant back to its local date and time", () => {
    const iso = combineLocal("2026-08-15", "13:45", DUE_FALLBACK)
    expect(iso).not.toBeNull()
    expect(toDateInput(iso)).toBe("2026-08-15")
    expect(toTimeInput(iso)).toBe("13:45")
  })
})

describe("combineLocal", () => {
  it("returns null when there is no date (a cleared schedule)", () => {
    expect(combineLocal("", "10:00", DUE_FALLBACK)).toBeNull()
    expect(combineLocal("", "", START_FALLBACK)).toBeNull()
  })

  it("uses the picked time when one is given", () => {
    expect(toTimeInput(combineLocal("2026-01-02", "09:15", DUE_FALLBACK))).toBe("09:15")
  })

  it("falls back to the field's default time for a date-only entry", () => {
    expect(toTimeInput(combineLocal("2026-01-02", "", DUE_FALLBACK))).toBe(DUE_FALLBACK)
    expect(toTimeInput(combineLocal("2026-01-02", "", START_FALLBACK))).toBe(START_FALLBACK)
  })

  it("stores a UTC ISO instant", () => {
    expect(combineLocal("2026-06-15", "12:00", DUE_FALLBACK)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
  })

  it("orders instants by their local time-of-day", () => {
    const morning = combineLocal("2026-06-15", "09:00", DUE_FALLBACK)
    const evening = combineLocal("2026-06-15", "17:00", DUE_FALLBACK)
    expect(new Date(String(morning)).getTime()).toBeLessThan(new Date(String(evening)).getTime())
  })
})

describe("formatDate", () => {
  it("returns empty for no date", () => {
    expect(formatDate(null)).toBe("")
  })

  it("omits the time for a date-only entry and includes it when hasTime", () => {
    const iso = combineLocal("2026-08-15", "13:00", DUE_FALLBACK)
    const dateOnly = formatDate(iso, false)
    const withTime = formatDate(iso, true)
    expect(dateOnly).not.toBe("")
    expect(withTime).not.toBe(dateOnly)
    expect(withTime.length).toBeGreaterThan(dateOnly.length)
  })
})

describe("dueDayState", () => {
  it("is null with no date, and for a resolved task (no urgency)", () => {
    expect(dueDayState(null, false)).toBeNull()
    expect(dueDayState(daysFromNow(-1), true)).toBeNull()
  })

  it("classifies by local calendar day: overdue / today / upcoming", () => {
    expect(dueDayState(daysFromNow(-1), false)).toBe("overdue")
    expect(dueDayState(daysFromNow(0), false)).toBe("today")
    expect(dueDayState(daysFromNow(1), false)).toBe("upcoming")
  })
})

// The date-range button labels. Anchored on Tue 2026-08-25 (Aug 24 2026 is a Monday,
// see presets.test); weekday/month names assume the en-US default locale, as elsewhere.
const now = new Date(2026, 7, 25)

describe("formatMonthDay", () => {
  it("is month + day within the current year", () => {
    expect(formatMonthDay("2026-08-18", now)).toBe("Aug 18")
    expect(formatMonthDay("2026-09-01", now)).toBe("Sep 1")
  })

  it("adds the year when the day is not in the current year", () => {
    expect(formatMonthDay("2027-08-18", now)).toBe("Aug 18, 2027")
    expect(formatMonthDay("2025-12-31", now)).toBe("Dec 31, 2025")
  })

  it("is empty for a blank day", () => {
    expect(formatMonthDay("", now)).toBe("")
  })
})

describe("formatDayLabel", () => {
  it("uses the weekday within the coming week (0–6 days out)", () => {
    expect(formatDayLabel("2026-08-25", "", now)).toBe("Tuesday") // today
    expect(formatDayLabel("2026-08-28", "", now)).toBe("Friday") // +3
    expect(formatDayLabel("2026-08-31", "", now)).toBe("Monday") // +6, last day in-window
  })

  it("falls back to month/day at a week out or beyond", () => {
    expect(formatDayLabel("2026-09-01", "", now)).toBe("Sep 1") // +7
    expect(formatDayLabel("2026-10-15", "", now)).toBe("Oct 15")
  })

  it("uses month/day for past dates, never a this-week weekday", () => {
    expect(formatDayLabel("2026-08-24", "", now)).toBe("Aug 24") // yesterday
    expect(formatDayLabel("2020-01-01", "", now)).toBe("Jan 1, 2020")
  })

  it("appends a set time", () => {
    // The AM/PM style is locale-dependent (like formatDate's test) — pin only the
    // stable base + numeric time, not the "PM" vs "p.m." rendering.
    expect(formatDayLabel("2026-08-28", "13:00", now)).toMatch(/^Friday, 1:00\b/)
    expect(formatDayLabel("2026-10-15", "09:30", now)).toMatch(/^Oct 15, 9:30\b/)
  })

  it("is empty for a blank day", () => {
    expect(formatDayLabel("", "13:00", now)).toBe("")
  })
})
