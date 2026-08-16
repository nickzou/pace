import { usePowerSync, useQuery } from "@powersync/react"
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker"
import { useEffect, useRef, useState } from "react"
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { type Palette, useTheme, useThemedStyles } from "../theme"
import { useToast } from "../toast"
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
import { deleteWithUndo, type Task, toggleTask, updateTask } from "./mutations"

// The single-task view/editor. On mobile there's no navigation, so this
// full-screen Modal IS the detail view (the analogue of the web's /tasks/$taskId
// route + quick modal). Open by passing a task id; `null` keeps it closed. React
// context (PowerSync, toast) flows into RN Modal children, so the editor reads the
// live task and raises the Undo toast just like the list does.
export function TaskDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Modal
      visible={id !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.screen}>{id !== null ? <Detail id={id} onClose={onClose} /> : null}</View>
    </Modal>
  )
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const db = usePowerSync()
  const toast = useToast()
  const styles = useThemedStyles(makeStyles)
  const { colors } = useTheme()
  const { data: rows } = useQuery<Task>(
    "SELECT id, title, description, completed, start_date, due_date, start_has_time, due_has_time, created_at, updated_at FROM tasks WHERE id = ?",
    [id],
  )
  const task = rows[0]

  // Seed the edit fields from the row only when the id first loads, so a
  // background sync can't clobber in-progress typing.
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const seededFor = useRef<string | null>(null)
  useEffect(() => {
    if (task && seededFor.current !== task.id) {
      seededFor.current = task.id
      setTitle(task.title)
      setDescription(task.description)
    }
  }, [task])

  const saveTitle = () => {
    if (!task) return
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) void updateTask(db, id, { title: trimmed, description })
    else setTitle(task.title)
  }

  const saveDescription = () => {
    if (task && description !== task.description)
      void updateTask(db, id, { title: task.title, description })
  }

  // Scheduling (P2-02). Date + optional time (mirrors web). Dates read straight from
  // the live row (no seeded state to clobber). A date always stores a full
  // timestamp; *_has_time records whether a real time was picked. iOS shows a
  // spinner in the chosen mode; Android opens the native dialog imperatively.
  type Save = (iso: string | null, hasTime: boolean) => void
  type Fallback = { hours: number; minutes: number }

  const [iosPicker, setIosPicker] = useState<{
    mode: "date" | "time"
    value: Date
    onPick: (picked?: Date) => void
  } | null>(null)

  const openPicker = (mode: "date" | "time", value: Date, onPick: (picked?: Date) => void) => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode,
        onChange: (_e, picked) => onPick(picked ?? undefined),
      })
    } else {
      setIosPicker({ mode, value, onPick })
    }
  }

  const saveStart: Save = (iso, hasTime) => {
    void updateTask(db, id, { start_date: iso, start_has_time: hasTime ? 1 : 0 })
  }
  const saveDue: Save = (iso, hasTime) => {
    void updateTask(db, id, { due_date: iso, due_has_time: hasTime ? 1 : 0 })
  }

  // Pick/replace the day (keeps an existing time); pick/replace the time (marks
  // hasTime); clear just the time (back to date-only). Clearing the date is inline.
  const pickDay = (current: string | null, hasTime: boolean, fallback: Fallback, save: Save) =>
    openPicker("date", toDate(current) ?? new Date(), (picked) => {
      if (picked) save(combineDay(picked, current, hasTime, fallback), hasTime)
    })
  const pickTime = (current: string | null, save: Save) =>
    openPicker("time", toDate(current) ?? new Date(), (picked) => {
      if (picked) save(combineTime(picked, current), true)
    })
  const clearTime = (current: string | null, fallback: Fallback, save: Save) => {
    const day = toDate(current)
    if (day) save(combineDay(day, current, false, fallback), false)
  }

  const dueState = task ? dueDayState(task.due_date, task.completed) : null

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.header}>
        <Pressable testID="detail-close" onPress={onClose} hitSlop={8}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      {!task ? (
        <Text style={styles.gone}>This task no longer exists.</Text>
      ) : (
        <>
          <View style={styles.titleRow}>
            <Pressable
              testID="detail-toggle"
              onPress={() => void toggleTask(db, task)}
              style={[styles.checkbox, task.completed ? styles.checkboxDone : null]}
            >
              {task.completed ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
            <TextInput
              testID="detail-title"
              value={title}
              onChangeText={setTitle}
              onBlur={saveTitle}
              placeholder="Task title"
              placeholderTextColor={colors.textFaint}
              style={styles.titleInput}
            />
          </View>

          <TextInput
            testID="detail-notes"
            value={description}
            onChangeText={setDescription}
            onBlur={saveDescription}
            placeholder="Add notes…"
            placeholderTextColor={colors.textFaint}
            multiline
            style={styles.notes}
          />

          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Start</Text>
            <Pressable
              testID="detail-start"
              onPress={() =>
                pickDay(task.start_date, !!task.start_has_time, START_FALLBACK, saveStart)
              }
              style={styles.dateValueBtn}
            >
              <Text style={styles.dateValue}>
                {task.start_date ? formatDate(task.start_date, false) : "Set start date"}
              </Text>
            </Pressable>
            {task.start_date ? (
              <>
                <Pressable
                  testID="detail-start-time"
                  onPress={() => pickTime(task.start_date, saveStart)}
                  style={styles.timeChip}
                >
                  <Text style={task.start_has_time ? styles.timeText : styles.addTimeText}>
                    {task.start_has_time ? formatTime(task.start_date) : "Add start time"}
                  </Text>
                </Pressable>
                {task.start_has_time ? (
                  <Pressable
                    testID="detail-start-time-clear"
                    onPress={() => clearTime(task.start_date, START_FALLBACK, saveStart)}
                    hitSlop={8}
                  >
                    <Text style={styles.dateClear}>✕</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  testID="detail-start-clear"
                  onPress={() => saveStart(null, false)}
                  hitSlop={8}
                >
                  <Text style={styles.dateClear}>Clear</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Due</Text>
            <Pressable
              testID="detail-due"
              onPress={() => pickDay(task.due_date, !!task.due_has_time, DUE_FALLBACK, saveDue)}
              style={styles.dateValueBtn}
            >
              <Text
                style={[
                  styles.dateValue,
                  dueState === "overdue"
                    ? styles.dateOverdue
                    : dueState === "today"
                      ? styles.dateToday
                      : null,
                ]}
              >
                {task.due_date ? formatDate(task.due_date, false) : "Set due date"}
              </Text>
            </Pressable>
            {task.due_date ? (
              <>
                <Pressable
                  testID="detail-due-time"
                  onPress={() => pickTime(task.due_date, saveDue)}
                  style={styles.timeChip}
                >
                  <Text style={task.due_has_time ? styles.timeText : styles.addTimeText}>
                    {task.due_has_time ? formatTime(task.due_date) : "Add due time"}
                  </Text>
                </Pressable>
                {task.due_has_time ? (
                  <Pressable
                    testID="detail-due-time-clear"
                    onPress={() => clearTime(task.due_date, DUE_FALLBACK, saveDue)}
                    hitSlop={8}
                  >
                    <Text style={styles.dateClear}>✕</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  testID="detail-due-clear"
                  onPress={() => saveDue(null, false)}
                  hitSlop={8}
                >
                  <Text style={styles.dateClear}>Clear</Text>
                </Pressable>
              </>
            ) : null}
            {dueState === "overdue" ? (
              <Text style={styles.overdueBadge}>Overdue</Text>
            ) : dueState === "today" ? (
              <Text style={styles.todayBadge}>Today</Text>
            ) : null}
          </View>

          {iosPicker ? (
            <DateTimePicker
              value={iosPicker.value}
              mode={iosPicker.mode}
              onChange={(_e, picked) => {
                const { onPick } = iosPicker
                setIosPicker(null)
                onPick(picked ?? undefined)
              }}
            />
          ) : null}

          <Pressable
            testID="detail-delete"
            onPress={() => void handleDelete()}
            style={styles.deleteBtn}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  )

  async function handleDelete() {
    if (!task) return
    await deleteWithUndo(db, task, toast)
    onClose()
  }
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    container: { padding: 24, paddingTop: 64, gap: 16 },
    header: { flexDirection: "row", justifyContent: "flex-end" },
    done: { color: c.primary, fontSize: 15, fontWeight: "600" },
    gone: { color: c.textSecondary, fontSize: 15, marginTop: 12 },
    titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
    checkbox: {
      marginTop: 6,
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: c.textFaint,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxDone: { borderColor: c.success, backgroundColor: "rgba(16,185,129,0.2)" },
    check: { color: c.successText, fontSize: 12 },
    titleInput: {
      flex: 1,
      color: c.textPrimary,
      fontSize: 20,
      fontWeight: "600",
      paddingVertical: 2,
    },
    notes: {
      minHeight: 120,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceInput,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      color: c.textPrimary,
      fontSize: 15,
      textAlignVertical: "top",
    },
    deleteBtn: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    deleteText: { color: c.textSecondary, fontSize: 15 },
    dateRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
    dateLabel: { color: c.textSecondary, fontSize: 13, width: 44 },
    dateValueBtn: {
      flexGrow: 1,
      flexBasis: 120,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceInput,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    dateValue: { color: c.textPrimary, fontSize: 15 },
    dateOverdue: { color: c.dangerText },
    dateToday: { color: c.warning },
    overdueBadge: { color: c.dangerText, fontSize: 11, fontWeight: "600" },
    todayBadge: { color: c.warning, fontSize: 11, fontWeight: "600" },
    dateClear: { color: c.textMuted, fontSize: 13 },
    timeChip: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceInput,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    timeText: { color: c.textPrimary, fontSize: 15 },
    addTimeText: { color: c.textMuted, fontSize: 13 },
  })
