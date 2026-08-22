// Preset quick-dates for the due-date picker (P2-08 · R4). Pure given `now` — returns local
// "YYYY-MM-DD" days; each app converts to its stored timestamp via its own date helpers. Semantics
// per decision 8: "this weekend" = the coming Saturday, "next week" = next week's Monday, "a month"
// = the same day next month (clamped to the last valid day).
const pad = (n: number) => String(n).padStart(2, "0")
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export type DuePreset = { key: string; label: string; day: string }

export function presetDueDays(now: Date): DuePreset[] {
  const dow = now.getDay() // 0 Sun … 6 Sat
  const toSaturday = (6 - dow + 7) % 7 // days to the coming Saturday (0 if today is Saturday)
  const toNextMonday = (8 - dow) % 7 || 7 // days to NEXT week's Monday (always in the future)
  // "A month": same day-of-month next month, clamped when next month is shorter.
  const firstNext = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const lastDayNext = new Date(firstNext.getFullYear(), firstNext.getMonth() + 1, 0).getDate()
  const monthDay = new Date(
    firstNext.getFullYear(),
    firstNext.getMonth(),
    Math.min(now.getDate(), lastDayNext),
  )
  return [
    { key: "today", label: "Today", day: ymd(now) },
    { key: "tomorrow", label: "Tomorrow", day: ymd(addDays(now, 1)) },
    { key: "weekend", label: "This weekend", day: ymd(addDays(now, toSaturday)) },
    { key: "next-week", label: "Next week", day: ymd(addDays(now, toNextMonday)) },
    { key: "two-weeks", label: "2 weeks", day: ymd(addDays(now, 14)) },
    { key: "four-weeks", label: "4 weeks", day: ymd(addDays(now, 28)) },
    { key: "month", label: "A month", day: ymd(monthDay) },
  ]
}
