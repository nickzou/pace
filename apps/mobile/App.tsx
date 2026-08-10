// Polyfill async iterators before anything imports PowerSync — its watch/stream
// APIs rely on Symbol.asyncIterator, which the RN runtime doesn't ship.
import "@azure/core-asynciterator-polyfill"

import { usePowerSync, useQuery } from "@powersync/react"
import * as Crypto from "expo-crypto"
import { StatusBar } from "expo-status-bar"
import { useEffect, useState } from "react"
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

export default function App() {
  return (
    <ApiProvider>
      <Main />
    </ApiProvider>
  )
}

function Main() {
  const { data: session, isPending } = useSession()
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
      <StatusBar style="light" />
      {signedIn ? (
        <SignedIn email={session?.user.email ?? ""} onSignOut={handleSignOut} />
      ) : isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e5e5e5" />
        </View>
      ) : (
        <AuthScreen />
      )}
    </View>
  )
}

function SignedIn({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.authBar}>
        <Text testID="signed-in" style={styles.authBarText} numberOfLines={1}>
          Signed in as <Text style={styles.authBarEmail}>{email}</Text>
        </Text>
        <Pressable testID="sign-out" onPress={onSignOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <Text style={styles.brand}>Pace</Text>
      <Text style={styles.tag}>set your own pace</Text>

      <PowerSyncProvider>
        <Tasks />
      </PowerSyncProvider>
    </ScrollView>
  )
}

// Reads/writes go straight to local SQLite. useQuery is live — it re-runs on any
// change to the tasks table (a local write or a row synced down), so there's no
// cache to invalidate and no optimistic bookkeeping. PowerSync uploads local
// writes to the API in the background. (Mirrors apps/web's TaskList.)
type TaskRow = { id: string; title: string; completed: number }

function Tasks() {
  const db = usePowerSync()
  const [title, setTitle] = useState("")
  const { data: tasks, isLoading } = useQuery<TaskRow>(
    "SELECT id, title, completed FROM tasks ORDER BY created_at DESC",
  )

  function add() {
    const trimmed = title.trim()
    if (!trimmed) return
    const now = new Date().toISOString()
    void db.execute(
      "INSERT INTO tasks (id, title, description, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [Crypto.randomUUID(), trimmed, "", 0, now, now],
    )
    setTitle("")
  }

  const toggle = (task: TaskRow) =>
    db.execute("UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?", [
      task.completed ? 0 : 1,
      new Date().toISOString(),
      task.id,
    ])

  const remove = (id: string) => db.execute("DELETE FROM tasks WHERE id = ?", [id])

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
          placeholderTextColor="#525252"
          style={styles.input}
          returnKeyType="done"
        />
        <Pressable testID="add-task" onPress={add} disabled={!title.trim()} style={styles.addBtn}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#e5e5e5" style={styles.tasksLoading} />
      ) : tasks.length === 0 ? (
        <Text style={styles.footer}>No tasks yet — add your first above.</Text>
      ) : (
        tasks.map((task) => (
          <View key={task.id} style={styles.task}>
            <Pressable
              onPress={() => toggle(task)}
              style={[styles.checkbox, task.completed ? styles.checkboxDone : null]}
            >
              {task.completed ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
            <Text style={[styles.taskText, task.completed ? styles.taskTextDone : null]}>
              {task.title}
            </Text>
            <Pressable onPress={() => remove(task.id)} hitSlop={8}>
              <Text style={styles.delete}>✕</Text>
            </Pressable>
          </View>
        ))
      )}
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a0a0a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 24, paddingTop: 72, gap: 8 },
  authBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 20,
  },
  authBarText: { color: "#a3a3a3", fontSize: 13, flexShrink: 1 },
  authBarEmail: { color: "#e5e5e5" },
  signOut: { color: "#a3a3a3", fontSize: 13, marginLeft: 12 },
  brand: { fontSize: 44, fontWeight: "700", color: "#e5e5e5" },
  tag: { fontSize: 16, fontStyle: "italic", color: "#a3a3a3", marginTop: 4 },
  section: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#a3a3a3",
    marginTop: 28,
    marginBottom: 12,
  },
  addRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#404040",
    backgroundColor: "#0a0a0a",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: "#e5e5e5",
    fontSize: 15,
  },
  addBtn: {
    backgroundColor: "#0ea5e9",
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#0a0a0a", fontWeight: "600", fontSize: 15 },
  tasksLoading: { marginTop: 12, alignSelf: "flex-start" },
  task: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#171717",
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
    borderColor: "#525252",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.2)" },
  check: { color: "#34d399", fontSize: 12 },
  taskText: { color: "#e5e5e5", fontSize: 15, flex: 1 },
  taskTextDone: { color: "#737373", textDecorationLine: "line-through" },
  delete: { color: "#525252", fontSize: 16, paddingHorizontal: 4 },
  footer: { color: "#525252", fontSize: 12, marginTop: 12, lineHeight: 18 },
})
