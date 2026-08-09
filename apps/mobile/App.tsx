import { useTRPC } from "@pace/api-client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { StatusBar } from "expo-status-bar"
import { useState } from "react"
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
import { signOut, useSession } from "./lib/auth-client"

export default function App() {
  return (
    <ApiProvider>
      <Main />
    </ApiProvider>
  )
}

function Main() {
  const { data: session, isPending } = useSession()

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator color="#e5e5e5" />
        </View>
      ) : session ? (
        <SignedIn email={session.user.email} />
      ) : (
        <AuthScreen />
      )}
    </View>
  )
}

function SignedIn({ email }: { email: string }) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.authBar}>
        <Text testID="signed-in" style={styles.authBarText} numberOfLines={1}>
          Signed in as <Text style={styles.authBarEmail}>{email}</Text>
        </Text>
        <Pressable testID="sign-out" onPress={() => signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <Text style={styles.brand}>Pace</Text>
      <Text style={styles.tag}>set your own pace</Text>

      <Tasks />
    </ScrollView>
  )
}

function Tasks() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")

  const listKey = trpc.tasks.list.queryKey()
  const tasks = useQuery(trpc.tasks.list.queryOptions())

  const createTask = useMutation(
    trpc.tasks.create.mutationOptions({
      // Optimistic: show the new task immediately, roll back on error, re-fetch
      // on settle to reconcile with the server.
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: listKey })
        const previous = queryClient.getQueryData(listKey)
        const now = new Date().toISOString()
        queryClient.setQueryData(listKey, (old = []) => [
          {
            id: `optimistic-${now}`,
            title: input.title,
            description: input.description ?? "",
            completed: false,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
          ...old,
        ])
        return { previous }
      },
      onError: (_error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(listKey, context.previous)
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
    }),
  )

  function add() {
    const trimmed = title.trim()
    if (!trimmed) return
    createTask.mutate({ title: trimmed })
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
          placeholderTextColor="#525252"
          style={styles.input}
          returnKeyType="done"
        />
        <Pressable
          testID="add-task"
          onPress={add}
          disabled={!title.trim() || createTask.isPending}
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {tasks.isPending ? (
        <ActivityIndicator color="#e5e5e5" style={styles.tasksLoading} />
      ) : tasks.isError ? (
        <Text style={styles.footer}>Couldn't load tasks.</Text>
      ) : tasks.data.length === 0 ? (
        <Text style={styles.footer}>No tasks yet — add your first above.</Text>
      ) : (
        tasks.data.map((task) => (
          <View key={task.id} style={styles.task}>
            <View style={[styles.checkbox, task.completed && styles.checkboxDone]}>
              {task.completed ? <Text style={styles.check}>✓</Text> : null}
            </View>
            <Text style={[styles.taskText, task.completed && styles.taskTextDone]}>
              {task.title}
            </Text>
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
  taskText: { color: "#e5e5e5", fontSize: 15, flexShrink: 1 },
  taskTextDone: { color: "#737373", textDecorationLine: "line-through" },
  footer: { color: "#525252", fontSize: 12, marginTop: 12, lineHeight: 18 },
})
