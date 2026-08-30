import { activeTimezone, describe, monthlyRuleBody, withAnchor } from "@pace/validation"
import { usePowerSync, useQuery } from "@powersync/react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { type Palette, useThemedStyles } from "../theme"
import { setTaskRecurrence } from "./mutations"

// The "Repeat" control in the mobile task detail (P2-08) — the native twin of apps/web's. Frequency
// chips + an on-completion toggle over the shared recurrence engine, anchored to the due date in the
// user's ACCOUNT timezone (the same zone the server advances in). Needs a due date; without one it
// prompts for it.
const FREQS = [
  { key: "none", label: "None" },
  { key: "daily", label: "Daily" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "2 weeks" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
] as const

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
  const styles = useThemedStyles(makeStyles)
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
      <View style={styles.container}>
        <Text style={styles.label}>Repeat</Text>
        <Text style={styles.hint}>Set a due date to make this task repeat.</Text>
      </View>
    )
  }

  const tz = activeTimezone()
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
    <View style={styles.container}>
      <Text style={styles.label}>Repeat</Text>
      <View style={styles.chips}>
        {FREQS.map((f) => {
          const on = f.key === freq
          return (
            <Pressable
              key={f.key}
              testID={`repeat-${f.key}`}
              onPress={() => changeFreq(f.key)}
              style={[styles.chip, on ? styles.chipOn : null]}
            >
              <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{f.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {recurrence ? (
        <>
          <Text style={styles.subLabel}>When completed</Text>
          <View style={styles.chips}>
            {(["advance", "duplicate"] as const).map((r) => {
              const on = r === regen
              return (
                <Pressable
                  key={r}
                  testID={`regen-${r}`}
                  onPress={() => changeRegen(r)}
                  style={[styles.chip, on ? styles.chipOn : null]}
                >
                  <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>
                    {r === "advance" ? "Reschedule it" : "New task"}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <Text style={styles.summary}>Repeats {describe(recurrence)}.</Text>
        </>
      ) : null}
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { gap: 8 },
    label: { color: c.textSecondary, fontSize: 13, fontWeight: "600" },
    subLabel: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    hint: {
      color: c.textFaint,
      fontSize: 13,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      borderStyle: "dashed",
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { color: c.textSecondary, fontSize: 13 },
    chipTextOn: { color: c.onPrimary, fontWeight: "600" },
    summary: { color: c.textMuted, fontSize: 12 },
  })
