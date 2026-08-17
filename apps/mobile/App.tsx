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
import { dueDayState, formatDate } from "./lib/tasks/dates"
import { deleteWithUndo, setTaskStatus, type Task } from "./lib/tasks/mutations"
import { StatusControl, type StatusOption } from "./lib/tasks/status-control"
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
  const { colors } = useTheme()
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

  const statusesByGroup = useMemo(() => {
    const map = new Map<string, StatusOption[]>()
    for (const s of allStatuses) {
      const arr = map.get(s.group_id) ?? []
      arr.push({ id: s.id, name: s.name, color: s.color, category: s.category })
      map.set(s.group_id, arr)
    }
    return map
  }, [allStatuses])

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
        <Pressable testID="add-task" onPress={add} disabled={!title.trim()} style={styles.addBtn}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.textPrimary} style={styles.tasksLoading} />
      ) : tasks.length === 0 ? (
        <Text style={styles.footer}>No tasks yet — add your first above.</Text>
      ) : (
        tasks.map((task) => {
          const resolved = task.status_category === "done"
          const dueState = dueDayState(task.due_date, resolved)
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
              <Pressable
                testID={`open-${task.id}`}
                style={styles.taskBody}
                onPress={() => setSelectedId(task.id)}
              >
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
    taskText: { color: c.textPrimary, fontSize: 15 },
    taskDesc: { color: c.textMuted, fontSize: 13, marginTop: 2 },
    taskDue: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    taskDueOverdue: { color: c.dangerText },
    taskDueToday: { color: c.warning },
    taskTextDone: { color: c.textMuted, textDecorationLine: "line-through" },
    delete: { color: c.textFaint, fontSize: 16, paddingHorizontal: 4 },
    footer: { color: c.textFaint, fontSize: 12, marginTop: 12, lineHeight: 18 },
  })
