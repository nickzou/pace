// Polyfill async iterators before anything imports PowerSync — its watch/stream
// APIs rely on Symbol.asyncIterator, which the RN runtime doesn't ship.
import "@azure/core-asynciterator-polyfill"

import { usePowerSync, useQuery } from "@powersync/react"
import * as Crypto from "expo-crypto"
import { StatusBar } from "expo-status-bar"
import { useEffect, useMemo, useState } from "react"
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { AuthScreen } from "./AuthScreen"
import { ApiProvider } from "./lib/api"
import { hasStoredSession, signOut, useSession } from "./lib/auth-client"
import { PowerSyncProvider } from "./lib/powersync/provider"
import { SettingsModal } from "./lib/settings/settings-modal"
import { TagChips, type TagOption, TagPicker } from "./lib/tags/tag-control"
import { dueDayState, formatDate } from "./lib/tasks/dates"
import { matchesFilters } from "./lib/tasks/filter"
import { deleteWithUndo, setTaskStatus, type Task } from "./lib/tasks/mutations"
import { StatusControl, type StatusOption, statusHex } from "./lib/tasks/status-control"
import { TaskDetailModal } from "./lib/tasks/task-detail-modal"
import { type Palette, ThemeProvider, useTheme, useThemedStyles } from "./lib/theme"
import { ToastProvider, useToast } from "./lib/toast"

export default function App() {
  return (
    <ThemeProvider>
      <ApiProvider>
        <ToastProvider>
          <Main />
        </ToastProvider>
      </ApiProvider>
    </ThemeProvider>
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
    <ScrollView contentContainerStyle={styles.container}>
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
        <Tasks />
        {/* Inside the provider so the settings status-management can query the local DB. */}
        <SettingsModal
          visible={settingsOpen}
          email={email}
          onClose={() => setSettingsOpen(false)}
        />
      </PowerSyncProvider>
    </ScrollView>
  )
}

// A task joined with its status (P2-03).
type ListTask = Task & {
  status_name: string
  status_color: string
  status_category: string
  status_group_id: string
}

// Reads/writes go straight to local SQLite. useQuery is live — it re-runs on any
// change to the tasks table (a local write or a row synced down), so there's no
// cache to invalidate and no optimistic bookkeeping. PowerSync uploads local
// writes to the API in the background. (Mirrors apps/web's TaskList.)
function Tasks() {
  const db = usePowerSync()
  const toast = useToast()
  const styles = useThemedStyles(makeStyles)
  const { scheme, colors } = useTheme()
  const [title, setTitle] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: tasks, isLoading } = useQuery<ListTask>(
    `SELECT t.id, t.title, t.description, t.status_id, t.resolved_at,
            t.start_date, t.due_date, t.start_has_time, t.due_has_time,
            t.created_at, t.updated_at,
            s.name AS status_name, s.color AS status_color,
            s.category AS status_category, s.group_id AS status_group_id
     FROM tasks t JOIN statuses s ON s.id = t.status_id ORDER BY t.created_at DESC`,
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

  const visible = tasks.filter((t) =>
    matchesFilters(t, tagsByTask.get(t.id) ?? [], {
      tags: filterTags.length ? filterTags : undefined,
    }),
  )
  const toggleFilterTag = (id: string) =>
    setFilterTags((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  function add() {
    const trimmed = title.trim()
    if (!trimmed || !defaultStatusId) return
    const now = new Date().toISOString()
    void db.execute(
      "INSERT INTO tasks (id, title, description, status_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [Crypto.randomUUID(), trimmed, "", defaultStatusId, now, now],
    )
    setTitle("")
  }

  return (
    <>
      <Text style={styles.section}>Tasks</Text>

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
      ) : visible.length === 0 ? (
        <Text style={styles.footer}>
          {filterTags.length
            ? "No tasks match the tag filter."
            : "No tasks yet — add your first above."}
        </Text>
      ) : (
        visible.map((task) => {
          const resolved = task.status_category === "done"
          const dueState = dueDayState(task.due_date, resolved)
          const tags = tagsByTask.get(task.id) ?? []
          return (
            <View key={task.id} style={styles.task}>
              <StatusControl
                current={{
                  id: task.status_id,
                  name: task.status_name,
                  color: task.status_color,
                  category: task.status_category,
                }}
                options={statusesByGroup.get(task.status_group_id) ?? []}
                onSelect={(sid) => void setTaskStatus(db, task.id, sid)}
              />
              <View style={styles.bodyCol}>
                <Pressable testID={`open-${task.id}`} onPress={() => setSelectedId(task.id)}>
                  <Text
                    style={[styles.taskText, resolved ? styles.taskTextDone : null]}
                    numberOfLines={1}
                  >
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
              >
                <Text style={styles.delete}>✕</Text>
              </Pressable>
            </View>
          )
        })
      )}

      <TaskDetailModal id={selectedId} onClose={() => setSelectedId(null)} />
    </>
  )
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
    taskDesc: { color: c.textMuted, fontSize: 13, marginTop: 2 },
    taskDue: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    taskDueOverdue: { color: c.dangerText },
    taskDueToday: { color: c.warning },
    taskTextDone: { color: c.textMuted, textDecorationLine: "line-through" },
    delete: { color: c.textFaint, fontSize: 16, paddingHorizontal: 4 },
    footer: { color: c.textFaint, fontSize: 12, marginTop: 12, lineHeight: 18 },
  })
