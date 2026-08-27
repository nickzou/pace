import { fontSize, fontWeight, radius, space } from "@pace/tokens"
import { presetDueDays, resolveScheduleRange } from "@pace/validation"
import NativeTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker"
import dayjs from "dayjs"
import { Calendar, X } from "lucide-react-native"
import { useState } from "react"
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import UiDatePicker, { type DateType, useDefaultStyles } from "react-native-ui-datepicker"
import { type Palette, useTheme, useThemedStyles } from "../theme"
import {
  combineDay,
  combineTime,
  DUE_FALLBACK,
  dueDayState,
  formatDate,
  formatTime,
  START_FALLBACK,
  toDate,
} from "./dates"
import { RecurrenceControl } from "./recurrence-control"

// The task's schedule as ONE control (the native twin of apps/web's DateRangeField). A single
// button shows the state — placeholder / a due date / a start→due range — and opens a modal with a
// react-native-ui-datepicker RANGE calendar, the quick-date presets, per-end native time pickers,
// and the Repeat control. Model (shared with web via resolveScheduleRange): a single day is a DUE
// date (the common case), a second distinct day makes a start→due range, and opening an empty field
// auto-sets today. Dates are stored as UTC ISO (via combineDay); the picker works in local days.
type Save = (iso: string | null, hasTime: boolean) => void
type Fallback = { hours: number; minutes: number }

const dayStr = (d: DateType) => (d ? dayjs(d).format("YYYY-MM-DD") : "")
const dayToDate = (day: string) => dayjs(day).toDate()

export function DateRangeField({
  taskId,
  startIso,
  dueIso,
  startHasTime,
  dueHasTime,
  resolved,
  onChangeStart,
  onChangeDue,
}: {
  taskId: string
  startIso: string | null
  dueIso: string | null
  startHasTime: boolean
  dueHasTime: boolean
  resolved: boolean
  onChangeStart: Save
  onChangeDue: Save
}) {
  const { colors, scheme } = useTheme()
  const styles = useThemedStyles(makeStyles)
  // The library's scheme-aware defaults, re-accented to our primary so the calendar matches the app.
  const base = useDefaultStyles(scheme)
  const calStyles = {
    ...base,
    today: { ...base.today, borderColor: colors.primary },
    today_label: { ...base.today_label, color: colors.primary },
    selected: { ...base.selected, backgroundColor: colors.primary, borderColor: colors.primary },
    selected_label: { ...base.selected_label, color: colors.onPrimary },
    range_start: { ...base.range_start, backgroundColor: colors.primary },
    range_start_label: { ...base.range_start_label, color: colors.onPrimary },
    range_end: { ...base.range_end, backgroundColor: colors.primary },
    range_end_label: { ...base.range_end_label, color: colors.onPrimary },
    range_middle: { ...base.range_middle, backgroundColor: `${colors.primary}22` },
    range_middle_label: { ...base.range_middle_label, color: colors.textPrimary },
  }
  const [open, setOpen] = useState(false)
  const [iosTime, setIosTime] = useState<{ value: Date; onPick: (d?: Date) => void } | null>(null)

  const dueState = dueDayState(dueIso, resolved)
  const hasAny = Boolean(startIso || dueIso)
  const isRange = Boolean(startIso && dueIso && startIso !== dueIso)

  // Reflect the stored start/due into the calendar's range. Due-only shows a single selected day
  // (start, no end); a full range shows both ends.
  const rangeStart = toDate(startIso ?? dueIso)
  const rangeEnd = startIso && dueIso ? toDate(dueIso) : undefined

  const label = !hasAny
    ? "Set date"
    : isRange
      ? `${formatDate(startIso, false)} → ${formatDate(dueIso, false)}`
      : formatDate(dueIso ?? startIso, dueIso ? dueHasTime : startHasTime)

  // Range → (start, due) via the shared flow rule; each end keeps its existing time when set,
  // otherwise its fallback (start-of-day for start, end-of-day for due).
  const applyRange = (fromDay: string, toDay: string) => {
    const { start, due } = resolveScheduleRange(fromDay, toDay)
    onChangeStart(
      start ? combineDay(dayToDate(start), startIso, startHasTime, START_FALLBACK) : null,
      start ? startHasTime : false,
    )
    onChangeDue(
      due ? combineDay(dayToDate(due), dueIso, dueHasTime, DUE_FALLBACK) : null,
      due ? dueHasTime : false,
    )
  }

  const openSheet = () => {
    // Least-friction default: opening an empty field sets the due date to today (mirrors web).
    if (!hasAny) onChangeDue(combineDay(new Date(), null, false, DUE_FALLBACK), false)
    setOpen(true)
  }

  const pickTime = (currentIso: string | null, save: Save) => {
    const value = toDate(currentIso) ?? new Date()
    const commit = (picked?: Date) => {
      if (picked) save(combineTime(picked, currentIso), true)
    }
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode: "time",
        onChange: (_e, picked) => commit(picked ?? undefined),
      })
    } else {
      setIosTime({ value, onPick: commit })
    }
  }
  const clearTime = (currentIso: string | null, fallback: Fallback, save: Save) => {
    const day = toDate(currentIso)
    if (day) save(combineDay(day, currentIso, false, fallback), false)
  }

  const setPreset = (day: string) => {
    const [py, pm, pd] = day.split("-").map(Number)
    const date = new Date(py as number, (pm as number) - 1, pd as number)
    onChangeDue(combineDay(date, dueIso, dueHasTime, DUE_FALLBACK), dueHasTime)
  }

  const clearAll = () => {
    onChangeStart(null, false)
    onChangeDue(null, false)
    setOpen(false)
  }

  return (
    <>
      <Pressable testID="detail-schedule" onPress={openSheet} style={styles.trigger}>
        <View style={styles.iconBox}>
          <Calendar size={14} color={colors.textMuted} />
        </View>
        <Text
          style={[
            styles.triggerLabel,
            !hasAny ? styles.placeholder : null,
            dueState === "overdue" ? styles.overdue : dueState === "today" ? styles.today : null,
          ]}
        >
          {label}
        </Text>
        {dueState === "overdue" ? (
          <Text style={styles.overdueBadge}>Overdue</Text>
        ) : dueState === "today" ? (
          <Text style={styles.todayBadge}>Today</Text>
        ) : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          {/* Absorb taps so pressing the card doesn't dismiss the modal. */}
          <Pressable style={styles.card} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <UiDatePicker
                mode="range"
                startDate={rangeStart}
                endDate={rangeEnd}
                firstDayOfWeek={0}
                allowRangeReset
                onChange={({ startDate, endDate }) =>
                  applyRange(dayStr(startDate), dayStr(endDate))
                }
                styles={calStyles}
              />

              {/* Quick-date presets — each sets the DUE date, keeping any start + time. */}
              <View style={styles.presetRow}>
                {presetDueDays(new Date()).map((p) => (
                  <Pressable
                    key={p.key}
                    testID={`due-preset-${p.key}`}
                    onPress={() => setPreset(p.day)}
                    style={styles.presetChip}
                  >
                    <Text style={styles.presetText}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Per-end times (native picker), shown once that end has a date. */}
              {startIso ? (
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Start time</Text>
                  <Pressable
                    testID="detail-start-time"
                    onPress={() => pickTime(startIso, onChangeStart)}
                    style={styles.timeChip}
                  >
                    <Text style={startHasTime ? styles.timeText : styles.addTime}>
                      {startHasTime ? formatTime(startIso) : "Add"}
                    </Text>
                  </Pressable>
                  {startHasTime ? (
                    <Pressable
                      testID="detail-start-time-clear"
                      onPress={() => clearTime(startIso, START_FALLBACK, onChangeStart)}
                      hitSlop={8}
                    >
                      <X size={14} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {dueIso ? (
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Due time</Text>
                  <Pressable
                    testID="detail-due-time"
                    onPress={() => pickTime(dueIso, onChangeDue)}
                    style={styles.timeChip}
                  >
                    <Text style={dueHasTime ? styles.timeText : styles.addTime}>
                      {dueHasTime ? formatTime(dueIso) : "Add"}
                    </Text>
                  </Pressable>
                  {dueHasTime ? (
                    <Pressable
                      testID="detail-due-time-clear"
                      onPress={() => clearTime(dueIso, DUE_FALLBACK, onChangeDue)}
                      hitSlop={8}
                    >
                      <X size={14} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {iosTime ? (
                <NativeTimePicker
                  value={iosTime.value}
                  mode="time"
                  onChange={(_e, picked) => {
                    const { onPick } = iosTime
                    setIosTime(null)
                    onPick(picked ?? undefined)
                  }}
                />
              ) : null}

              <RecurrenceControl taskId={taskId} />

              <View style={styles.actions}>
                {hasAny ? (
                  <Pressable testID="detail-clear" onPress={clearAll} style={styles.clearBtn}>
                    <Text style={styles.clearText}>Clear dates</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  testID="detail-schedule-done"
                  onPress={() => setOpen(false)}
                  style={styles.doneBtn}
                >
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: space[2],
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      backgroundColor: c.surfaceInput,
      paddingHorizontal: space[3],
      paddingVertical: space[3],
    },
    iconBox: {
      width: 24,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    triggerLabel: { flex: 1, fontSize: fontSize.base, color: c.textPrimary },
    placeholder: { color: c.textFaint },
    overdue: { color: c.danger },
    today: { color: c.warning },
    overdueBadge: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
      color: c.danger,
      backgroundColor: `${c.danger}22`,
      paddingHorizontal: space[2],
      paddingVertical: 2,
      borderRadius: radius.sm,
      overflow: "hidden",
    },
    todayBadge: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
      color: c.warning,
      backgroundColor: `${c.warning}22`,
      paddingHorizontal: space[2],
      paddingVertical: 2,
      borderRadius: radius.sm,
      overflow: "hidden",
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      alignItems: "center",
      justifyContent: "center",
      padding: space[4],
    },
    card: {
      width: "100%",
      maxWidth: 480,
      maxHeight: "88%",
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: space[4],
    },
    presetRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] },
    presetChip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.full,
      paddingHorizontal: space[3],
      paddingVertical: space[1],
    },
    presetText: { fontSize: fontSize.sm, color: c.textSecondary },
    timeRow: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[3] },
    timeLabel: { flex: 1, fontSize: fontSize.sm, color: c.textSecondary },
    timeChip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[1],
    },
    timeText: { fontSize: fontSize.sm, color: c.textPrimary },
    addTime: { fontSize: fontSize.sm, color: c.textFaint },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: space[3],
      marginTop: space[4],
    },
    clearBtn: { paddingHorizontal: space[3], paddingVertical: space[2] },
    clearText: { fontSize: fontSize.sm, color: c.textMuted },
    doneBtn: {
      backgroundColor: c.primary,
      borderRadius: radius.md,
      paddingHorizontal: space[5],
      paddingVertical: space[2],
    },
    doneText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: c.onPrimary },
  })
