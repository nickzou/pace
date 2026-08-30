// Timezone helpers shared across the API, web, and mobile (P2 Timezones). The app stores UTC
// instants but reasons/renders on the user's LOCAL calendar (a date-only due is 23:59 *local*),
// so both the recurrence engine and the date pickers convert instants ↔ local wall-clock in an
// IANA `tz`. These are the one implementation of that math (recurrence.ts and dates.ts both import
// them) — all hand-rolled on Intl, no tz library.

export type LocalFields = { y: number; mo: number; d: number; h: number; min: number }

// The offset (minutes ahead of UTC) of `tz` at a given instant.
export function tzOffsetMinutes(instant: Date, tz: string): number {
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
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return (asUtc - instant.getTime()) / 60000
}

// UTC instant (ISO string or Date) → the wall-clock fields a viewer in `tz` sees.
export function toLocalFields(iso: string | Date, tz: string): LocalFields {
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
  for (const part of dtf.formatToParts(typeof iso === "string" ? new Date(iso) : iso)) {
    p[part.type] = part.value
  }
  return {
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    min: Number(p.minute),
  }
}

// Local wall-clock fields in `tz` → the real UTC instant. DST-correct: solve for the offset at the
// target local time, then re-solve once if the resolved instant landed on the other side of a jump.
export function fromLocalFields(f: LocalFields, tz: string): Date {
  const guess = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.min)
  const off1 = tzOffsetMinutes(new Date(guess), tz)
  const utc1 = guess - off1 * 60000
  const off2 = tzOffsetMinutes(new Date(utc1), tz)
  return off2 === off1 ? new Date(utc1) : new Date(guess - off2 * 60000)
}

// Fallback list for engines without Intl.supportedValuesOf (older RN Hermes). Small but covers the
// common zones; the real list (~450 IANA zones) is used wherever supportedValuesOf exists.
const FALLBACK_ZONES = [
  "Etc/UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
]

// The full IANA zone list for the Settings picker.
export function timezoneList(): string[] {
  const supported = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf
  try {
    if (typeof supported === "function") return supported("timeZone")
  } catch {
    // fall through
  }
  return FALLBACK_ZONES
}

// The device's IANA zone, or Etc/UTC (≈ GMT) when it can't be resolved — the account default.
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC"
  } catch {
    return "Etc/UTC"
  }
}

// The app's ambient "active" timezone: the user's account tz once it's synced. The date
// helpers (dates.ts) default to it so every due/start-date calc and label resolves in the
// account zone without threading tz through dozens of call sites. TimezoneSync sets it from
// user_settings; until then it falls back to the device zone (unchanged behaviour). Per-app
// module state (each client bundles its own copy) — fine for a single-user client.
let active: string | null = null

export function setActiveTimezone(tz: string | null | undefined): void {
  active = tz || null
}

export function activeTimezone(): string {
  return active ?? detectTimezone()
}

// A "GMT-4"-style current-offset label for a zone (empty string if the zone is invalid), for the
// Settings picker so a user recognises the zone without knowing the IANA name.
export function timezoneOffsetLabel(zone: string, now: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")
    return part?.value ?? ""
  } catch {
    return ""
  }
}
