import { describe, expect, it } from "vitest"
import {
  combineDay,
  combineTime,
  DUE_FALLBACK,
  formatDate,
  formatTime,
  isOverdue,
  START_FALLBACK,
  toDate,
} from "./dates"

// The mobile helpers bridge stored UTC ISO ↔ JS Date (the native picker's currency).
// Assertions read back the LOCAL components (getHours/getDate…), so they hold in
// whatever timezone the suite runs under.

describe("toDate", () => {
  it("returns undefined for null or an unparseable value", () => {
    expect(toDate(null)).toBeUndefined()
    expect(toDate("not-a-date")).toBeUndefined()
  })

  it("parses a valid iso to a Date", () => {
    expect(toDate("2026-08-15T12:00:00.000Z")).toBeInstanceOf(Date)
  })
})

describe("combineDay", () => {
  it("uses the field's fallback time for a date-only entry", () => {
    const picked = new Date(2026, 7, 15, 10, 30) // the picker's time component is irrelevant here
    const d = new Date(combineDay(picked, null, false, DUE_FALLBACK))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(DUE_FALLBACK.hours)
    expect(d.getMinutes()).toBe(DUE_FALLBACK.minutes)
  })

  it("keeps an existing time and moves it to the picked day when hasTime", () => {
    const current = new Date(2026, 0, 1, 9, 15).toISOString()
    const picked = new Date(2026, 0, 2, 0, 0)
    const d = new Date(combineDay(picked, current, true, START_FALLBACK))
    expect(d.getDate()).toBe(2) // the newly picked day
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(15)
  })
})

describe("combineTime", () => {
  it("sets the time on the existing day", () => {
    const current = new Date(2026, 5, 20, 8, 0).toISOString()
    const d = new Date(combineTime(new Date(2026, 0, 1, 14, 45), current))
    expect(d.getMonth()).toBe(5) // June — the day is kept from `current`
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(45)
  })
})

describe("formatDate / formatTime", () => {
  it("return empty for no date", () => {
    expect(formatDate(null)).toBe("")
    expect(formatTime(null)).toBe("")
  })

  it("formatDate omits the time unless hasTime", () => {
    const iso = new Date(2026, 7, 15, 13, 0).toISOString()
    const dateOnly = formatDate(iso, false)
    const withTime = formatDate(iso, true)
    expect(dateOnly).not.toBe("")
    expect(withTime).not.toBe(dateOnly)
    expect(withTime.length).toBeGreaterThan(dateOnly.length)
  })

  it("formatTime renders a non-empty local time", () => {
    expect(formatTime(new Date(2026, 7, 15, 13, 0).toISOString())).not.toBe("")
  })
})

describe("isOverdue", () => {
  const PAST = "2000-01-01T00:00:00.000Z"
  const FUTURE = "2999-01-01T00:00:00.000Z"

  it("flags only a past due date on an incomplete task", () => {
    expect(isOverdue(PAST, 0)).toBe(true)
    expect(isOverdue(FUTURE, 0)).toBe(false)
    expect(isOverdue(PAST, 1)).toBe(false) // completed
    expect(isOverdue(null, 0)).toBe(false) // no due date
  })
})
