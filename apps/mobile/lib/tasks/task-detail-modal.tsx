import { usePowerSync, useQuery } from "@powersync/react"
import { useEffect, useRef, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { ScrollViewContainer } from "react-native-reorderable-list"
import { TagChips, type TagOption, TagPicker } from "../tags/tag-control"
import { type Palette, useTheme, useThemedStyles } from "../theme"
import { useToast } from "../toast"
import { ActivityPanel } from "./activity-panel"
import { DateRangeField } from "./date-range-field"
import { deleteWithUndo, setTaskParent, setTaskStatus, type Task, updateTask } from "./mutations"
import { StatusControl, type StatusOption } from "./status-control"
import { openStatusForGroup } from "./status-group"
import { SubtaskSection } from "./subtask-section"

// The single-task view/editor. On mobile there's no navigation, so this
// full-screen Modal IS the detail view (the analogue of the web's /tasks/$taskId
// route + quick modal). Open by passing a task id; `null` keeps it closed. React
// context (PowerSync, toast) flows into RN Modal children, so the editor reads the
// live task and raises the Undo toast just like the list does.
export function TaskDetailModal({
  id,
  onClose,
  onOpenTask,
}: {
  id: string | null
  onClose: () => void
  onOpenTask: (id: string) => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <Modal
      visible={id !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {/* RN Modal renders in a separate view hierarchy outside the app-root GestureHandlerRootView,
          so gestures (P2-06 subtask drag) need their own root here. Keyed by id so drilling into a
          subtask remounts with clean seeded state. */}
      <GestureHandlerRootView style={styles.screen}>
        {id !== null ? <Detail key={id} id={id} onClose={onClose} onOpenTask={onOpenTask} /> : null}
      </GestureHandlerRootView>
    </Modal>
  )
}

// A task joined with its status (P2-03).
type DetailTask = Task & {
  status_name: string
  status_color: string
  status_category: string
  status_group_id: string
  recurrence: string | null
  recurrence_regen: string | null
}

function Detail({
  id,
  onClose,
  onOpenTask,
}: {
  id: string
  onClose: () => void
  onOpenTask: (id: string) => void
}) {
  const db = usePowerSync()
  const toast = useToast()
  const styles = useThemedStyles(makeStyles)
  const { colors } = useTheme()
  const { data: rows } = useQuery<DetailTask>(
    `SELECT t.id, t.title, t.description, t.status_id, t.resolved_at,
            t.start_date, t.due_date, t.start_has_time, t.due_has_time, t.parent_id,
            t.recurrence, t.recurrence_regen, t.created_at, t.updated_at,
            s.name AS status_name, s.color AS status_color,
            s.category AS status_category, s.group_id AS status_group_id
     FROM tasks t JOIN statuses s ON s.id = t.status_id WHERE t.id = ?`,
    [id],
  )
  // Depth (1 = top-level), the parent (breadcrumb), and top-level tasks to re-parent under
  // (cycle-safe: descendants are never top-level). The server guards the actual move.
  const { data: depthRows } = useQuery<{ depth: number }>(
    `WITH RECURSIVE up(id, parent_id, lvl) AS (
       SELECT id, parent_id, 1 FROM tasks WHERE id = ?
       UNION ALL
       SELECT t.id, t.parent_id, up.lvl + 1 FROM tasks t JOIN up ON t.id = up.parent_id
     )
     SELECT max(lvl) AS depth FROM up`,
    [id],
  )
  const depth = depthRows[0]?.depth ?? 1
  const { data: parentRows } = useQuery<{ id: string; title: string }>(
    "SELECT p.id, p.title FROM tasks t JOIN tasks p ON p.id = t.parent_id WHERE t.id = ?",
    [id],
  )
  const parentTask = parentRows[0]
  const { data: topLevel } = useQuery<{ id: string; title: string }>(
    "SELECT id, title FROM tasks WHERE parent_id IS NULL AND id != ? ORDER BY created_at DESC",
    [id],
  )
  const { data: allStatuses } = useQuery<StatusOption & { group_id: string }>(
    "SELECT id, group_id, name, color, category FROM statuses ORDER BY position",
  )
  const { data: groups } = useQuery<{ id: string; name: string }>(
    "SELECT id, name FROM status_groups ORDER BY position, created_at",
  )
  const { data: allTags } = useQuery<TagOption>(
    "SELECT id, name, color FROM tags ORDER BY position, created_at",
  )
  const { data: taskTags } = useQuery<TagOption>(
    "SELECT tg.id, tg.name, tg.color FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.task_id = ?",
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

  // Scheduling (P2-08). start/due dates + optional times + Repeat all live in the DateRangeField
  // modal now; here we just supply the current values and the save handlers. A date always stores a
  // full UTC timestamp; *_has_time records whether a real time was picked.
  type Save = (iso: string | null, hasTime: boolean) => void
  const saveStart: Save = (iso, hasTime) => {
    void updateTask(db, id, { start_date: iso, start_has_time: hasTime ? 1 : 0 })
  }
  const saveDue: Save = (iso, hasTime) => {
    void updateTask(db, id, { due_date: iso, due_has_time: hasTime ? 1 : 0 })
  }
  const resolved = task ? task.status_category === "done" : false

  // Move the task to another status list. The group is derived from status_id, so switching
  // points the task at the target group's first open status (see openStatusForGroup).
  const selectGroup = (groupId: string) => {
    if (!task || groupId === task.status_group_id) return
    const target = openStatusForGroup(allStatuses, groupId)
    if (target) void setTaskStatus(db, id, target.id)
  }

  return (
    // ScrollViewContainer (react-native-reorderable-list) so the Subtasks NestedReorderableList can
    // auto-scroll while dragging (P2-06).
    <ScrollViewContainer
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.header}>
        <Pressable testID="detail-close" onPress={onClose} hitSlop={8}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      {parentTask ? (
        <Pressable
          testID="detail-parent"
          onPress={() => onOpenTask(parentTask.id)}
          style={styles.breadcrumb}
        >
          <Text style={styles.breadcrumbText} numberOfLines={1}>
            ↑ {parentTask.title}
          </Text>
        </Pressable>
      ) : null}

      {!task ? (
        <Text style={styles.gone}>This task no longer exists.</Text>
      ) : (
        <>
          <View style={styles.titleRow}>
            <StatusControl
              current={{
                id: task.status_id,
                name: task.status_name,
                color: task.status_color,
                category: task.status_category,
              }}
              options={allStatuses.filter((s) => s.group_id === task.status_group_id)}
              onSelect={(sid) => void setTaskStatus(db, id, sid)}
              showLabel
            />
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

          {groups.length > 1 ? (
            <View style={styles.listRow}>
              <Text style={styles.listLabel}>List</Text>
              <View style={styles.listChips}>
                {groups.map((g) => {
                  const active = g.id === task.status_group_id
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => selectGroup(g.id)}
                      style={[styles.listChip, active ? styles.listChipActive : null]}
                    >
                      <Text
                        style={[styles.listChipText, active ? styles.listChipTextActive : null]}
                      >
                        {g.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.listRow}>
            <Text style={styles.listLabel}>Parent</Text>
            <View style={styles.listChips}>
              <Pressable
                testID="parent-none"
                onPress={() => void setTaskParent(db, id, null)}
                style={[styles.listChip, !task.parent_id ? styles.listChipActive : null]}
              >
                <Text
                  style={[styles.listChipText, !task.parent_id ? styles.listChipTextActive : null]}
                >
                  None
                </Text>
              </Pressable>
              {parentTask && !topLevel.some((t) => t.id === task.parent_id) ? (
                <Pressable style={[styles.listChip, styles.listChipActive]}>
                  <Text style={[styles.listChipText, styles.listChipTextActive]}>
                    {parentTask.title}
                  </Text>
                </Pressable>
              ) : null}
              {topLevel.map((t) => {
                const active = t.id === task.parent_id
                return (
                  <Pressable
                    key={t.id}
                    testID={`parent-${t.title}`}
                    onPress={() => void setTaskParent(db, id, t.id)}
                    style={[styles.listChip, active ? styles.listChipActive : null]}
                  >
                    <Text style={[styles.listChipText, active ? styles.listChipTextActive : null]}>
                      {t.title}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View style={styles.tagsRow}>
            <TagChips tags={taskTags} taskId={id} max={99} />
            <TagPicker
              taskId={id}
              assignedIds={new Set(taskTags.map((t) => t.id))}
              allTags={allTags}
              nextPosition={allTags.length}
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

          <DateRangeField
            taskId={id}
            startIso={task.start_date}
            dueIso={task.due_date}
            startHasTime={!!task.start_has_time}
            dueHasTime={!!task.due_has_time}
            resolved={resolved}
            onChangeStart={saveStart}
            onChangeDue={saveDue}
          />

          <SubtaskSection parentId={id} depth={depth} onOpenTask={onOpenTask} />

          <ActivityPanel taskId={id} />

          <Pressable
            testID="detail-delete"
            onPress={() => void handleDelete()}
            style={styles.deleteBtn}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </>
      )}
    </ScrollViewContainer>
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
    breadcrumb: { alignSelf: "flex-start" },
    breadcrumbText: { color: c.textMuted, fontSize: 13 },
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
    tagsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    listRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    listLabel: { color: c.textSecondary, fontSize: 13, width: 44 },
    listChips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
    listChip: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    listChipActive: { backgroundColor: c.primary, borderColor: c.primary },
    listChipText: { color: c.textSecondary, fontSize: 13 },
    listChipTextActive: { color: c.onPrimary },
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
  })
