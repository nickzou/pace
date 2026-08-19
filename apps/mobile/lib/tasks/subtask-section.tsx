import { usePowerSync, useQuery } from "@powersync/react"
import { type ComponentProps, useMemo, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { NestedReorderableList, useReorderableDrag } from "react-native-reorderable-list"
import { type Palette, useTheme, useThemedStyles } from "../theme"
import { useToast } from "../toast"
import { formatDate } from "./dates"
import { createTask, deleteWithUndo, setTaskStatus, type Task } from "./mutations"
import { useReorder } from "./reorder"
import { StatusControl, type StatusOption } from "./status-control"

// Subtasks nest at most this deep (top-level = 1). Kept in step with the server's MAX_DEPTH.
export const MAX_DEPTH = 5

type ChildRow = {
  id: string
  title: string
  due_date: string | null
  due_has_time: number
  status_id: string
  status_name: string
  status_color: string
  status_category: string
  status_group_id: string
  child_count: number
  done_count: number
  sort_order: string
}

// The "Subtasks" section in a task's detail (P2-05) — the mobile twin of apps/web's. Lists
// the task's direct children with an inline status control + delete and an add composer;
// tapping a child drills into its own detail (onOpenTask swaps the modal's task, since RN has
// no routing). Hidden once the parent sits at MAX_DEPTH.
export function SubtaskSection({
  parentId,
  depth,
  onOpenTask,
}: {
  parentId: string
  depth: number
  onOpenTask: (id: string) => void
}) {
  const db = usePowerSync()
  const styles = useThemedStyles(makeStyles)
  const { colors } = useTheme()
  const [title, setTitle] = useState("")

  const { data: children } = useQuery<ChildRow>(
    `SELECT t.id, t.title, t.due_date, t.due_has_time, t.status_id, t.sort_order,
            s.name AS status_name, s.color AS status_color, s.category AS status_category,
            s.group_id AS status_group_id,
            (SELECT count(*) FROM tasks c WHERE c.parent_id = t.id) AS child_count,
            (SELECT count(*) FROM tasks c JOIN statuses cs ON cs.id = c.status_id
               WHERE c.parent_id = t.id AND cs.category = 'done') AS done_count
     FROM tasks t JOIN statuses s ON s.id = t.status_id
     WHERE t.parent_id = ? ORDER BY t.sort_order, t.id`,
    [parentId],
  )
  const { data: allStatuses } = useQuery<StatusOption & { group_id: string }>(
    "SELECT id, group_id, name, color, category FROM statuses ORDER BY position",
  )
  const statusesByGroup = useMemo(() => {
    const map = new Map<string, StatusOption[]>()
    for (const s of allStatuses) {
      const arr = map.get(s.group_id) ?? []
      arr.push({ id: s.id, name: s.name, color: s.color, category: s.category })
      map.set(s.group_id, arr)
    }
    return map
  }, [allStatuses])
  const { data: def } = useQuery<{ id: string }>(
    `SELECT s.id FROM statuses s JOIN status_groups g ON g.id = s.group_id
     WHERE g.is_default = 1 AND s.category = 'open' ORDER BY s.position LIMIT 1`,
  )
  const defaultStatusId = def[0]?.id

  const atMax = depth >= MAX_DEPTH
  const doneCount = children.filter((c) => c.status_category === "done").length
  // Drag-reorder the subtasks (P2-06), with an optimistic order so a drop doesn't snap back.
  const { items: orderedChildren, onReorder } = useReorder(db, children)

  const add = async () => {
    const t = title.trim()
    if (!t || !defaultStatusId) return
    await createTask(db, { title: t, statusId: defaultStatusId, parentId })
    setTitle("")
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.heading}>Subtasks</Text>
        {children.length > 0 ? (
          <Text style={styles.count}>
            {doneCount}/{children.length}
          </Text>
        ) : null}
      </View>

      {children.length > 0 ? (
        // Long-press a subtask to drag-reorder it within this parent (P2-06). Nested inside the
        // detail modal's ScrollViewContainer.
        <NestedReorderableList
          data={orderedChildren}
          keyExtractor={(c) => c.id}
          onReorder={onReorder}
          renderItem={({ item }) => (
            <DraggableSubtaskRow
              child={item}
              options={statusesByGroup.get(item.status_group_id) ?? []}
              onOpen={() => onOpenTask(item.id)}
            />
          )}
        />
      ) : null}

      {atMax ? (
        <Text style={styles.hint}>Maximum nesting depth reached.</Text>
      ) : (
        <View style={styles.addRow}>
          <TextInput
            testID="subtask-input"
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={() => void add()}
            placeholder="Add a subtask…"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          <Pressable
            testID="subtask-add"
            onPress={() => void add()}
            disabled={!title.trim()}
            style={styles.addBtn}
          >
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

// One subtask row. Module-level so the reorderable list keeps stable cell identity across
// renders. `onLongPressDrag`, when set, lifts the row for dragging (P2-06).
function SubtaskRow({
  child: c,
  options,
  onOpen,
  onLongPressDrag,
}: {
  child: ChildRow
  options: StatusOption[]
  onOpen: () => void
  onLongPressDrag?: () => void
}) {
  const db = usePowerSync()
  const toast = useToast()
  const styles = useThemedStyles(makeStyles)
  const done = c.status_category === "done"
  return (
    <View style={styles.row}>
      <StatusControl
        current={{
          id: c.status_id,
          name: c.status_name,
          color: c.status_color,
          category: c.status_category,
        }}
        options={options}
        onSelect={(sid) => void setTaskStatus(db, c.id, sid)}
      />
      <Pressable
        testID={`subtask-${c.title}`}
        style={styles.titlePress}
        onPress={onOpen}
        onLongPress={onLongPressDrag}
        delayLongPress={220}
      >
        <Text style={[styles.title, done ? styles.titleDone : null]} numberOfLines={1}>
          {c.title}
        </Text>
      </Pressable>
      {c.child_count > 0 ? (
        <Text style={styles.meta}>
          {c.done_count}/{c.child_count}
        </Text>
      ) : null}
      {c.due_date ? (
        <Text style={styles.meta}>{formatDate(c.due_date, !!c.due_has_time)}</Text>
      ) : null}
      <Pressable
        testID={`subtask-delete-${c.title}`}
        onPress={() => void deleteWithUndo(db, { id: c.id } as Task, toast)}
        hitSlop={8}
      >
        <Text style={styles.del}>✕</Text>
      </Pressable>
    </View>
  )
}

// The draggable variant: useReorderableDrag (valid only inside a ReorderableList cell) provides
// the long-press-to-lift trigger.
function DraggableSubtaskRow(props: Omit<ComponentProps<typeof SubtaskRow>, "onLongPressDrag">) {
  const drag = useReorderableDrag()
  return <SubtaskRow {...props} onLongPressDrag={drag} />
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: {
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heading: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    count: { color: c.textSecondary, fontSize: 13 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
    titlePress: { flex: 1, minWidth: 0 },
    title: { color: c.textPrimary, fontSize: 15 },
    titleDone: { color: c.textMuted, textDecorationLine: "line-through" },
    meta: { color: c.textMuted, fontSize: 12 },
    del: { color: c.dangerText, fontSize: 14 },
    hint: { color: c.textSecondary, fontSize: 13 },
    addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceInput,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: c.textPrimary,
      fontSize: 15,
    },
    addBtn: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    addBtnText: { color: c.onPrimary, fontWeight: "600", fontSize: 14 },
  })
