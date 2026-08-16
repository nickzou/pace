import { describe, expect, it } from "vitest"
import {
  combineLocal,
  DUE_FALLBACK,
  dueDayState,
  formatDate,
  START_FALLBACK,
  toDateInput,
  toTimeInput,
} from "./dates"

const daysFromNow = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

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
  it("is null with no date, and for a completed task (no urgency)", () => {
    expect(dueDayState(null, 0)).toBeNull()
    expect(dueDayState(daysFromNow(-1), 1)).toBeNull()
  })

  it("classifies by local calendar day: overdue / today / upcoming", () => {
    expect(dueDayState(daysFromNow(-1), 0)).toBe("overdue")
    expect(dueDayState(daysFromNow(0), 0)).toBe("today")
    expect(dueDayState(daysFromNow(1), 0)).toBe("upcoming")
  })
})
