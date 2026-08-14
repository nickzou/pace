import { usePowerSync, useQuery } from "@powersync/react"
import { useEffect, useRef, useState } from "react"
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useToast } from "../toast"
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
    "SELECT id, title, description, completed, created_at, updated_at FROM tasks WHERE id = ?",
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
})
