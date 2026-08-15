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
import { useToast } from "../toast"
import { formatDate, fromDate, isOverdue, toDate } from "./dates"
import { deleteWithUndo, type Task, toggleTask, updateTask } from "./mutations"

// The single-task view/editor. On mobile there's no navigation, so this
// full-screen Modal IS the detail view (the analogue of the web's /tasks/$taskId
// route + quick modal). Open by passing a task id; `null` keeps it closed. React
// context (PowerSync, toast) flows into RN Modal children, so the editor reads the
// live task and raises the Undo toast just like the list does.
export function TaskDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
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
  const { data: rows } = useQuery<Task>(
    "SELECT id, title, description, completed, start_date, due_date, created_at, updated_at FROM tasks WHERE id = ?",
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

  // Scheduling (P2-02). Dates read straight from the live row (no seeded state to
  // clobber) and save on each pick. iOS shows a combined datetime spinner; Android
  // has no "datetime" mode, so chain date → time imperatively.
  const [iosPicker, setIosPicker] = useState<{
    field: "start_date" | "due_date"
    value: Date
  } | null>(null)

  const setDate = (field: "start_date" | "due_date", value: string | null) => {
    void updateTask(db, id, field === "start_date" ? { start_date: value } : { due_date: value })
  }

  const pickDate = (field: "start_date" | "due_date", current: string | null) => {
    const base = toDate(current) ?? new Date()
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        onChange: (_e, picked) => {
          if (!picked) return
          DateTimePickerAndroid.open({
            value: picked,
            mode: "time",
            onChange: (_e2, withTime) => {
              if (withTime) setDate(field, fromDate(withTime))
            },
          })
        },
      })
    } else {
      setIosPicker({ field, value: base })
    }
  }

  const overdue = !!task && isOverdue(task.due_date, task.completed)

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
              placeholderTextColor="#525252"
              style={styles.titleInput}
            />
          </View>

          <TextInput
            testID="detail-notes"
            value={description}
            onChangeText={setDescription}
            onBlur={saveDescription}
            placeholder="Add notes…"
            placeholderTextColor="#525252"
            multiline
            style={styles.notes}
          />

          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Start</Text>
            <Pressable
              testID="detail-start"
              onPress={() => pickDate("start_date", task.start_date)}
              style={styles.dateValueBtn}
            >
              <Text style={styles.dateValue}>
                {task.start_date ? formatDate(task.start_date) : "Set…"}
              </Text>
            </Pressable>
            {task.start_date ? (
              <Pressable
                testID="detail-start-clear"
                onPress={() => setDate("start_date", null)}
                hitSlop={8}
              >
                <Text style={styles.dateClear}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>Due</Text>
            <Pressable
              testID="detail-due"
              onPress={() => pickDate("due_date", task.due_date)}
              style={styles.dateValueBtn}
            >
              <Text style={[styles.dateValue, overdue ? styles.dateOverdue : null]}>
                {task.due_date ? formatDate(task.due_date) : "Set…"}
              </Text>
            </Pressable>
            {overdue ? <Text style={styles.overdueBadge}>Overdue</Text> : null}
            {task.due_date ? (
              <Pressable
                testID="detail-due-clear"
                onPress={() => setDate("due_date", null)}
                hitSlop={8}
              >
                <Text style={styles.dateClear}>Clear</Text>
              </Pressable>
            ) : null}
          </View>

          {iosPicker ? (
            <DateTimePicker
              value={iosPicker.value}
              mode="datetime"
              onChange={(_e, picked) => {
                setIosPicker(null)
                if (picked) setDate(iosPicker.field, fromDate(picked))
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0a0a" },
  container: { padding: 24, paddingTop: 64, gap: 16 },
  header: { flexDirection: "row", justifyContent: "flex-end" },
  done: { color: "#0ea5e9", fontSize: 15, fontWeight: "600" },
  gone: { color: "#a3a3a3", fontSize: 15, marginTop: 12 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  checkbox: {
    marginTop: 6,
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#525252",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.2)" },
  check: { color: "#34d399", fontSize: 12 },
  titleInput: { flex: 1, color: "#e5e5e5", fontSize: 20, fontWeight: "600", paddingVertical: 2 },
  notes: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0a0a0a",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: "#e5e5e5",
    fontSize: 15,
    textAlignVertical: "top",
  },
  deleteBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#262626",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  deleteText: { color: "#a3a3a3", fontSize: 15 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dateLabel: { color: "#a3a3a3", fontSize: 13, width: 44 },
  dateValueBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#0a0a0a",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dateValue: { color: "#e5e5e5", fontSize: 15 },
  dateOverdue: { color: "#f87171" },
  overdueBadge: { color: "#f87171", fontSize: 11, fontWeight: "600" },
  dateClear: { color: "#737373", fontSize: 13 },
})
