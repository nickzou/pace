import { describe, expect, it } from "vitest"
import { presetDueDays } from "./presets"

// Anchor most cases on Wed 2026-08-19 (a midweek day, distinct dow from every boundary).
const wed = new Date(2026, 7, 19) // Aug 19 2026 is a Wednesday
const days = (now: Date) => Object.fromEntries(presetDueDays(now).map((p) => [p.key, p.day]))

describe("presetDueDays", () => {
  it("today/tomorrow are the local day and the next day", () => {
    const d = days(wed)
    expect(d.today).toBe("2026-08-19")
    expect(d.tomorrow).toBe("2026-08-20")
  })

  it("this weekend is the coming Saturday", () => {
    expect(days(wed).weekend).toBe("2026-08-22") // Sat after Wed
    expect(days(new Date(2026, 7, 22)).weekend).toBe("2026-08-22") // on Saturday → today
    expect(days(new Date(2026, 7, 23)).weekend).toBe("2026-08-29") // Sunday → next Saturday
  })

  it("next week is next week's Monday (always future)", () => {
    expect(days(wed)["next-week"]).toBe("2026-08-24") // Mon after Wed
    expect(days(new Date(2026, 7, 24))["next-week"]).toBe("2026-08-31") // on Monday → +7
    expect(days(new Date(2026, 7, 23))["next-week"]).toBe("2026-08-24") // Sunday → tomorrow's Monday
  })

  it("2/4 weeks are +14/+28 days", () => {
    const d = days(wed)
    expect(d["two-weeks"]).toBe("2026-09-02")
    expect(d["four-weeks"]).toBe("2026-09-16")
  })

  it("a month is the same day next month, clamped to shorter months", () => {
    expect(days(wed).month).toBe("2026-09-19")
    // Jan 31 → Feb has no 31st → clamp to Feb 28 (2026 is not a leap year)
    expect(days(new Date(2026, 0, 31)).month).toBe("2026-02-28")
  })
})
