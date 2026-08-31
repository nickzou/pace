// Polyfill async iterators before anything imports PowerSync — its watch/stream
// APIs rely on Symbol.asyncIterator, which the RN runtime doesn't ship.
import "@azure/core-asynciterator-polyfill"

import { usePowerSync, useQuery } from "@powersync/react"
import { StatusBar } from "expo-status-bar"
import { X } from "lucide-react-native"
import { type ComponentProps, useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import {
  NestedReorderableList,
  ScrollViewContainer,
  useReorderableDrag,
} from "react-native-reorderable-list"
import { AuthScreen } from "./AuthScreen"
import { ApiProvider } from "./lib/api"
import { hasStoredSession, signOut, useSession } from "./lib/auth-client"
import { PowerSyncProvider } from "./lib/powersync/provider"
import { SettingsModal } from "./lib/settings/settings-modal"
import { TimezoneSync } from "./lib/statuses/timezone-sync"
import { TagChips, type TagOption, TagPicker } from "./lib/tags/tag-control"
import { dueDayState, formatDate } from "./lib/tasks/dates"
import { DEFAULT_LAYOUT, type Layout, matchesFilters } from "./lib/tasks/filter"
import { LayoutSwitcher } from "./lib/tasks/layout-switcher"
import { createTask, deleteWithUndo, setTaskStatus } from "./lib/tasks/mutations"
import { useReorder } from "./lib/tasks/reorder"
import { StatusControl, type StatusOption, statusHex } from "./lib/tasks/status-control"
import { TaskDetailModal } from "./lib/tasks/task-detail-modal"
import BoardView from "./lib/tasks/views/board-view"
import CalendarView from "./lib/tasks/views/calendar-view"
import type { ListTask } from "./lib/tasks/views/types"
import { type Palette, ThemeProvider, useTheme, useThemedStyles } from "./lib/theme"
import { ToastProvider, useToast } from "./lib/toast"
import { Checkbox } from "./lib/ui/checkbox"

export default function App() {
  return (
    // GestureHandlerRootView must wrap the whole app for react-native-gesture-handler (P2-06
    // drag-to-reorder) to receive touches.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <ApiProvider>
          <ToastProvider>
            <Main />
          </ToastProvider>
        </ApiProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}

function Main() {
  const { data: session, isPending } = useSession()
  const styles = useThemedStyles(makeStyles)
  const { scheme, colors } = useTheme()
  // Explicit sign-out intent — flips straight to the auth screen, so a tap works
  // immediately even if clearing the stored session lags. A returning session
  // (a fresh sign-in) cancels it.
  const [signedOut, setSignedOut] = useState(false)
  useEffect(() => {
    if (session) setSignedOut(false)
  }, [session])

  async function handleSignOut() {
    setSignedOut(true)
    await signOut()
  }

  // Offline-durable auth: a stored session counts as signed in even when
  // useSession's server refetch momentarily returns null (offline / reconnect).
  // Only an explicit sign-out (or a genuinely absent local session) shows the
  // auth screen.
  const signedIn = !signedOut && (!!session || hasStoredSession())

  return (
    <View style={styles.screen}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {signedIn ? (
        <SignedIn email={session?.user.email ?? ""} onSignOut={handleSignOut} />
      ) : isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      ) : (
        <AuthScreen />
      )}
    </View>
  )
}

function SignedIn({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const styles = useThemedStyles(makeStyles)
  const [settingsOpen, setSettingsOpen] = useState(false)
  return (
    // ScrollViewContainer (from react-native-reorderable-list) replaces the plain ScrollView so a
    // NestedReorderableList inside it can auto-scroll while dragging near the edges (P2-06).
    <ScrollViewContainer contentContainerStyle={styles.container}>
      <View style={styles.authBar}>
        <Text testID="signed-in" style={styles.authBarText} numberOfLines={1}>
          Signed in as <Text style={styles.authBarEmail}>{email}</Text>
        </Text>
        <View style={styles.authBarActions}>
          <Pressable testID="settings-open" onPress={() => setSettingsOpen(true)} hitSlop={8}>
            <Text style={styles.authBarBtn}>Settings</Text>
          </Pressable>
          <Pressable testID="sign-out" onPress={onSignOut} hitSlop={8}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.brand}>Pace</Text>
      <Text style={styles.tag}>set your own pace</Text>

      <PowerSyncProvider>
        {/* Keeps the user's timezone auto-detected for recurrence math (P2-08). Renders nothing. */}
        <TimezoneSync />
        <Tasks />
        {/* Inside the provider so the settings status-management can query the local DB. */}
        <SettingsModal
          visible={settingsOpen}
          email={email}
          onClose={() => setSettingsOpen(false)}
          onSignOut={onSignOut}
        />
      </PowerSyncProvider>
    </ScrollViewContainer>
  )
}

// Reads/writes go straight to local SQLite. useQuery is live — it re-runs on any
// change to the tasks table (a local write or a row synced down), so there's no
// cache to invalidate and no optimistic bookkeeping. PowerSync uploads local
// writes to the API in the background. (Mirrors apps/web's TaskList.)
function Tasks() {
  const db = usePowerSync()
  const styles = useThemedStyles(makeStyles)
  const { scheme, colors } = useTheme()
  const [title, setTitle] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Presentation layout (P2-07). Session-only on native (no URL / persistence, decision).
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT)
  // Whether subtasks surface as their own items in the calendar/board (default off). The list
  // always keeps them nested under their parent.
  const [showSubtasks, setShowSubtasks] = useState(false)
  const { data: tasks, isLoading } = useQuery<ListTask>(
    `SELECT t.id, t.title, t.description, t.status_id, t.resolved_at,
            t.start_date, t.due_date, t.start_has_time, t.due_has_time, t.parent_id,
            t.sort_order, t.recurrence, t.created_at, t.updated_at,
            s.name AS status_name, s.color AS status_color,
            s.category AS status_category, s.group_id AS status_group_id,
            (SELECT count(*) FROM tasks c WHERE c.parent_id = t.id) AS child_count,
            (SELECT count(*) FROM tasks c JOIN statuses cs ON cs.id = c.status_id
               WHERE c.parent_id = t.id AND cs.category = 'done') AS done_count
     FROM tasks t JOIN statuses s ON s.id = t.status_id ORDER BY t.sort_order, t.id`,
  )
  const { data: allStatuses } = useQuery<StatusOption & { group_id: string }>(
    "SELECT id, group_id, name, color, category FROM statuses ORDER BY position",
  )
  const { data: defaults } = useQuery<{ id: string }>(
    "SELECT s.id FROM statuses s JOIN status_groups g ON g.id = s.group_id WHERE g.is_default = 1 AND s.category = 'open' ORDER BY s.position LIMIT 1",
  )
  const defaultStatusId = defaults[0]?.id
  const { data: allTags } = useQuery<TagOption>(
    "SELECT id, name, color FROM tags ORDER BY position, created_at",
  )
  const { data: links } = useQuery<TagOption & { task_id: string }>(
    "SELECT tt.task_id, tg.id, tg.name, tg.color FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id",
  )
  // Local (not URL — RN has no URL) tag include filter: tap a pill to narrow to it (any-of).
  const [filterTags, setFilterTags] = useState<string[]>([])

  const statusesByGroup = useMemo(() => {
    const map = new Map<string, StatusOption[]>()
    for (const s of allStatuses) {
      const arr = map.get(s.group_id) ?? []
      arr.push({ id: s.id, name: s.name, color: s.color, category: s.category })
      map.set(s.group_id, arr)
    }
    return map
  }, [allStatuses])

  const tagsByTask = useMemo(() => {
    const map = new Map<string, TagOption[]>()
    for (const l of links) {
      const arr = map.get(l.task_id) ?? []
      arr.push({ id: l.id, name: l.name, color: l.color })
      map.set(l.task_id, arr)
    }
    return map
  }, [links])

  // Task id → title, so a surfaced subtask can show where it lives.
  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks])

  // Unfiltered, the list shows only top-level tasks — subtasks live inside their parent. A
  // tag filter flattens to every matching task at any depth, each with a parent breadcrumb.
  const flat = filterTags.length > 0
  // In the calendar/board a subtask can surface as its own item when "Show subtasks" is on; a tag
  // filter already flattens everything. The list stays top-level-only (subtasks live in the modal).
  const includeSubtasks = flat || (layout !== "list" && showSubtasks)
  const visible = tasks
    .filter((t) =>
      matchesFilters(t, tagsByTask.get(t.id) ?? [], {
        tags: filterTags.length ? filterTags : undefined,
      }),
    )
    .filter((t) => includeSubtasks || t.parent_id == null)
  // Dragging lives only in the unfiltered top-level list (P2-06); a filtered subset has no
  // defined drop target. The reorder hook adds an optimistic order so a drop doesn't snap back.
  const draggable = !flat
  const { items: ordered, onReorder } = useReorder(db, visible)

  // One derived bundle handed to whichever non-list view is active (mirrors apps/web).
  const viewProps = {
    tasks: visible,
    statusesByGroup,
    allStatuses,
    tagsByTask,
    defaultStatusId,
    onOpen: setSelectedId,
  }
  const toggleFilterTag = (id: string) =>
    setFilterTags((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  function add() {
    const trimmed = title.trim()
    if (!trimmed || !defaultStatusId) return
    // createTask mints a bottom-of-scope sort key, so a new task lands at the end of the list.
    void createTask(db, { title: trimmed, statusId: defaultStatusId })
    setTitle("")
  }

  return (
    <>
      <Text style={styles.section}>Tasks</Text>

      <View style={styles.switcherRow}>
        <LayoutSwitcher current={layout} onChange={setLayout} />
        {layout !== "list" ? (
          <View style={styles.subtaskToggle}>
            <Checkbox checked={showSubtasks} onCheckedChange={setShowSubtasks} />
            <Pressable
              testID="toggle-subtasks"
              onPress={() => setShowSubtasks((v) => !v)}
              hitSlop={6}
            >
              <Text style={styles.subtaskToggleText}>Show subtasks</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.addRow}>
        <TextInput
          testID="task-input"
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={add}
          placeholder="Add a task…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          returnKeyType="done"
        />
        <Pressable
          testID="add-task"
          onPress={add}
          disabled={!title.trim() || !defaultStatusId}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {allTags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {allTags.map((t) => {
            const on = filterTags.includes(t.id)
            const color = statusHex(t.color, scheme)
            return (
              <Pressable
                key={t.id}
                testID={`filter-pill-${t.name}`}
                onPress={() => toggleFilterTag(t.id)}
                style={[
                  styles.filterPill,
                  { borderColor: color },
                  on ? { backgroundColor: color } : null,
                ]}
              >
                <Text style={[styles.filterPillText, on ? styles.filterPillTextOn : null]}>
                  {t.name}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={colors.textPrimary} style={styles.tasksLoading} />
      ) : layout === "calendar" ? (
        <CalendarView {...viewProps} />
      ) : layout === "board" ? (
        <BoardView {...viewProps} />
      ) : visible.length === 0 ? (
        <Text style={styles.footer}>
          {filterTags.length
            ? "No tasks match the tag filter."
            : "No tasks yet — add your first above."}
        </Text>
      ) : draggable ? (
        // Unfiltered top-level list: long-press a row to drag-reorder. Nested inside the screen's
        // ScrollViewContainer, so it doesn't scroll itself; the separator replaces the container's
        // gap between rows.
        <NestedReorderableList
          data={ordered}
          keyExtractor={(t) => t.id}
          onReorder={onReorder}
          renderItem={({ item }) => (
            <DraggableTaskRow
              task={item}
              options={statusesByGroup.get(item.status_group_id) ?? []}
              tags={tagsByTask.get(item.id) ?? []}
              allTags={allTags}
              parentTitle={item.parent_id ? titleById.get(item.parent_id) : undefined}
              onOpen={() => setSelectedId(item.id)}
            />
          )}
        />
      ) : (
        ordered.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            options={statusesByGroup.get(task.status_group_id) ?? []}
            tags={tagsByTask.get(task.id) ?? []}
            allTags={allTags}
            parentTitle={task.parent_id ? titleById.get(task.parent_id) : undefined}
            onOpen={() => setSelectedId(task.id)}
          />
        ))
      )}

      <TaskDetailModal
        id={selectedId}
        onClose={() => setSelectedId(null)}
        onOpenTask={setSelectedId}
      />
    </>
  )
}

// One task row. Module-level (not defined inside Tasks) so the reorderable list keeps stable cell
// identity across renders. `onLongPressDrag`, when set, lifts the row for dragging (P2-06).
function TaskRow({
  task,
  options,
  tags,
  allTags,
  parentTitle,
  onOpen,
  onLongPressDrag,
}: {
  task: ListTask
  options: StatusOption[]
  tags: TagOption[]
  allTags: TagOption[]
  parentTitle?: string
  onOpen: () => void
  onLongPressDrag?: () => void
}) {
  const db = usePowerSync()
  const toast = useToast()
  const styles = useThemedStyles(makeStyles)
  const { colors } = useTheme()
  const resolved = task.status_category === "done"
  const dueState = dueDayState(task.due_date, resolved)
  return (
    <View style={styles.task}>
      <StatusControl
        current={{
          id: task.status_id,
          name: task.status_name,
          color: task.status_color,
          category: task.status_category,
        }}
        options={options}
        onSelect={(sid) => void setTaskStatus(db, task.id, sid)}
      />
      <View style={styles.bodyCol}>
        <Pressable
          testID={`open-${task.id}`}
          onPress={onOpen}
          onLongPress={onLongPressDrag}
          delayLongPress={220}
        >
          {parentTitle ? (
            <Text style={styles.taskParent} numberOfLines={1}>
              ↳ in {parentTitle}
            </Text>
          ) : null}
          {task.child_count > 0 ? (
            <Text style={styles.taskProgress}>
              {task.done_count}/{task.child_count} subtasks
            </Text>
          ) : null}
          <Text style={[styles.taskText, resolved ? styles.taskTextDone : null]} numberOfLines={1}>
            {task.title}
          </Text>
          {task.description ? (
            <Text style={styles.taskDesc} numberOfLines={1}>
              {task.description}
            </Text>
          ) : null}
          {task.due_date ? (
            <Text
              style={[
                styles.taskDue,
                dueState === "overdue"
                  ? styles.taskDueOverdue
                  : dueState === "today"
                    ? styles.taskDueToday
                    : null,
              ]}
              numberOfLines={1}
            >
              {dueState === "overdue" ? "Overdue · " : "Due "}
              {formatDate(task.due_date, !!task.due_has_time)}
            </Text>
          ) : null}
        </Pressable>
        {tags.length > 0 ? <TagChips tags={tags} taskId={task.id} max={4} /> : null}
        <TagPicker
          taskId={task.id}
          assignedIds={new Set(tags.map((t) => t.id))}
          allTags={allTags}
          nextPosition={allTags.length}
        />
      </View>
      <Pressable
        testID={`delete-${task.id}`}
        onPress={() => void deleteWithUndo(db, task, toast)}
        hitSlop={8}
        style={styles.delete}
      >
        <X size={16} color={colors.textFaint} />
      </Pressable>
    </View>
  )
}

// The draggable variant: useReorderableDrag (valid only inside a ReorderableList cell) gives the
// long-press-to-lift trigger, wired to the row's onLongPress.
function DraggableTaskRow(props: Omit<ComponentProps<typeof TaskRow>, "onLongPressDrag">) {
  const drag = useReorderableDrag()
  return <TaskRow {...props} onLongPressDrag={drag} />
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    container: { padding: 24, paddingTop: 72, gap: 8 },
    authBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 20,
    },
    authBarText: { color: c.textSecondary, fontSize: 13, flexShrink: 1 },
    authBarEmail: { color: c.textPrimary },
    authBarActions: { flexDirection: "row", alignItems: "center", gap: 14, marginLeft: 12 },
    authBarBtn: { color: c.primary, fontSize: 13, fontWeight: "600" },
    signOut: { color: c.textSecondary, fontSize: 13 },
    brand: { fontSize: 44, fontWeight: "700", color: c.textPrimary },
    tag: { fontSize: 16, fontStyle: "italic", color: c.textSecondary, marginTop: 4 },
    section: {
      fontSize: 13,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
      color: c.textSecondary,
      marginTop: 28,
      marginBottom: 12,
    },
    switcherRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 12,
      marginBottom: 12,
    },
    subtaskToggle: { flexDirection: "row", alignItems: "center", gap: 8 },
    subtaskToggleText: { color: c.textSecondary, fontSize: 13 },
    addRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceInput,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      color: c.textPrimary,
      fontSize: 15,
    },
    addBtn: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    addBtnText: { color: c.onPrimary, fontWeight: "600", fontSize: 15 },
    tasksLoading: { marginTop: 12, alignSelf: "flex-start" },
    task: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    checkbox: {
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
    taskBody: { flex: 1 },
    bodyCol: { flex: 1, gap: 6 },
    filterRow: { gap: 8, paddingBottom: 12, paddingRight: 8 },
    filterPill: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    filterPillText: { color: c.textSecondary, fontSize: 13 },
    filterPillTextOn: { color: "#fff", fontWeight: "600" },
    taskText: { color: c.textPrimary, fontSize: 15 },
    taskParent: { color: c.textMuted, fontSize: 11, marginBottom: 2 },
    taskProgress: { color: c.textMuted, fontSize: 11, marginBottom: 2 },
    taskDesc: { color: c.textMuted, fontSize: 13, marginTop: 2 },
    taskDue: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    taskDueOverdue: { color: c.dangerText },
    taskDueToday: { color: c.warning },
    taskTextDone: { color: c.textMuted, textDecorationLine: "line-through" },
    delete: { paddingHorizontal: 4 },
    footer: { color: c.textFaint, fontSize: 12, marginTop: 12, lineHeight: 18 },
  })
