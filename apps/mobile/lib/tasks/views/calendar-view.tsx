import { occurrencesBetween } from "@pace/validation"
import { ChevronLeft, ChevronRight } from "lucide-react-native"
import { useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { type Palette, useTheme, useThemedStyles } from "../../theme"
import { formatDate } from "../dates"
import { statusHex } from "../status-control"
import type { ListTask, TaskViewProps } from "./types"

// Calendar view (P2-07 · mobile). No FullCalendar on native, so this is a compact month grid — a
// dot marks any day with a task due — over a tap-to-open agenda of the selected day (decision:
// month grid + day agenda, tap-to-open, no drag). Placement is by due_date, in LOCAL terms.
const pad = (n: number) => String(n).padStart(2, "0")
const dayKey = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`
const localDayOf = (iso: string) => {
  const d = new Date(iso)
  return dayKey(d.getFullYear(), d.getMonth(), d.getDate())
}
const WEEKDAYS = [
  { key: "sun", label: "S" },
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
]
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function prettyDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  const date = new Date(y as number, (m as number) - 1, d as number)
  return `${WD_SHORT[date.getDay()]}, ${MONTHS[(m as number) - 1]?.slice(0, 3)} ${d}`
}

export default function CalendarView({ tasks, onOpen }: TaskViewProps) {
  const { scheme, colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const today = useMemo(() => new Date(), [])
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate())

  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [selected, setSelected] = useState(todayKey)

  // due_date (local) → tasks. Keeps the base query's sort_order within a day.
  const byDay = useMemo(() => {
    const map = new Map<string, ListTask[]>()
    for (const t of tasks) {
      if (!t.due_date) continue
      const key = localDayOf(t.due_date)
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    return map
  }, [tasks])

  // Ghost occurrences (P2-08): a repeating task's UPCOMING dates across the visible month — faded
  // dots + muted agenda rows, never stored. Recomputed as the month (or tasks) change.
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const ghostByDay = useMemo(() => {
    const map = new Map<string, ListTask[]>()
    const start = new Date(cursor.y, cursor.m, 1).toISOString()
    const end = new Date(cursor.y, cursor.m + 1, 0, 23, 59).toISOString()
    for (const t of tasks) {
      if (!t.recurrence || !t.due_date) continue
      for (const iso of occurrencesBetween(t.recurrence, t.due_date, start, end, tz)) {
        const key = localDayOf(iso)
        const arr = map.get(key) ?? []
        arr.push(t)
        map.set(key, arr)
      }
    }
    return map
  }, [tasks, cursor, tz])

  // Leading blanks to the 1st's weekday, then each day, then trailing blanks to fill the last week.
  const cells = useMemo(() => {
    const startWeekday = new Date(cursor.y, cursor.m, 1).getDay()
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
    // Each cell carries a stable key (data-owned, not the render index) so the grid keys are safe.
    const out: { key: string; day: string | null }[] = []
    for (let i = 0; i < startWeekday; i++) out.push({ key: `lead-${i}`, day: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const k = dayKey(cursor.y, cursor.m, d)
      out.push({ key: k, day: k })
    }
    while (out.length % 7 !== 0) out.push({ key: `trail-${out.length}`, day: null })
    return out
  }, [cursor])

  const prev = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))
  const next = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))

  const agenda = byDay.get(selected) ?? []
  const ghostAgenda = ghostByDay.get(selected) ?? []

  return (
    <View>
      <View style={styles.header}>
        <Pressable testID="cal-prev" onPress={prev} hitSlop={12} style={styles.nav}>
          <ChevronLeft size={26} color={colors.primary} />
        </Pressable>
        <Text style={styles.title}>
          {MONTHS[cursor.m]} {cursor.y}
        </Text>
        <Pressable testID="cal-next" onPress={next} hitSlop={12} style={styles.nav}>
          <ChevronRight size={26} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w.key} style={styles.weekday}>
            {w.label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          if (!cell.day) return <View key={cell.key} style={styles.cell} />
          const key = cell.day
          const has = (byDay.get(key)?.length ?? 0) > 0
          const hasGhost = !has && (ghostByDay.get(key)?.length ?? 0) > 0
          const isSel = key === selected
          const isToday = key === todayKey
          return (
            <Pressable
              key={cell.key}
              testID={`cal-day-${key}`}
              onPress={() => setSelected(key)}
              style={[styles.cell, isSel ? styles.cellSel : null]}
            >
              <Text
                style={[
                  styles.cellNum,
                  isToday ? styles.cellToday : null,
                  isSel ? styles.cellNumSel : null,
                ]}
              >
                {Number(key.slice(-2))}
              </Text>
              <View
                style={[
                  styles.dot,
                  has ? (isSel ? styles.dotSel : styles.dotOn) : hasGhost ? styles.dotGhost : null,
                ]}
              />
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.agendaHeader}>{prettyDay(selected)}</Text>
      {agenda.length === 0 && ghostAgenda.length === 0 ? (
        <Text style={styles.empty}>Nothing due.</Text>
      ) : (
        <>
          {agenda.map((t) => (
            <Pressable
              key={t.id}
              testID={`cal-task-${t.id}`}
              onPress={() => onOpen(t.id)}
              style={styles.agendaRow}
            >
              <View
                style={[styles.statusDot, { backgroundColor: statusHex(t.status_color, scheme) }]}
              />
              <View style={styles.agendaBody}>
                <Text
                  style={[styles.agendaTitle, t.status_category === "done" ? styles.done : null]}
                  numberOfLines={1}
                >
                  {t.parent_id ? "↳ " : ""}
                  {t.title}
                </Text>
                {t.due_has_time ? (
                  <Text style={styles.agendaMeta}>{formatDate(t.due_date, true)}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          {/* Ghost occurrences — upcoming repeats, muted (P2-08). Tap opens the underlying task. */}
          {ghostAgenda.map((t) => (
            <Pressable
              key={`ghost-${t.id}`}
              testID={`cal-ghost-${t.id}`}
              onPress={() => onOpen(t.id)}
              style={[styles.agendaRow, styles.ghostRow]}
            >
              <View
                style={[styles.statusDot, { backgroundColor: statusHex(t.status_color, scheme) }]}
              />
              <View style={styles.agendaBody}>
                <Text style={styles.ghostTitle} numberOfLines={1}>
                  {t.parent_id ? "↳ " : ""}
                  {t.title}
                </Text>
                <Text style={styles.agendaMeta}>Upcoming</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    nav: { paddingHorizontal: 10 },
    title: { color: c.textPrimary, fontSize: 17, fontWeight: "700" },
    weekRow: { flexDirection: "row" },
    weekday: {
      width: `${100 / 7}%`,
      textAlign: "center",
      color: c.textFaint,
      fontSize: 11,
      fontWeight: "600",
      paddingBottom: 4,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      backgroundColor: c.surface,
      paddingVertical: 4,
    },
    cell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
    },
    cellSel: {},
    cellNum: {
      color: c.textSecondary,
      fontSize: 14,
      width: 28,
      height: 28,
      lineHeight: 28,
      textAlign: "center",
      borderRadius: 14,
      overflow: "hidden",
    },
    cellToday: { color: c.textPrimary, fontWeight: "700" },
    cellNumSel: { backgroundColor: c.primary, color: c.onPrimary, fontWeight: "700" },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "transparent" },
    dotOn: { backgroundColor: c.primary },
    dotSel: { backgroundColor: c.textPrimary },
    agendaHeader: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 18,
      marginBottom: 8,
    },
    empty: { color: c.textFaint, fontSize: 13, marginBottom: 8 },
    agendaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    agendaBody: { flex: 1, gap: 2 },
    agendaTitle: { color: c.textPrimary, fontSize: 15 },
    agendaMeta: { color: c.textMuted, fontSize: 12 },
    done: { color: c.textMuted, textDecorationLine: "line-through" },
    // Ghost occurrences (P2-08): a faded dot on the grid + a dashed, translucent agenda row.
    dotGhost: { backgroundColor: c.textFaint, opacity: 0.6 },
    ghostRow: { opacity: 0.55, borderStyle: "dashed", backgroundColor: "transparent" },
    ghostTitle: { color: c.textSecondary, fontSize: 15 },
  })
