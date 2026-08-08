import { StatusBar } from "expo-status-bar"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { AuthScreen } from "./AuthScreen"
import { signOut, useSession } from "./lib/auth-client"

const sampleTasks = [
  { id: 1, title: "Set up the monorepo", done: true },
  { id: 2, title: "Stand up the web + desktop shells", done: true },
  { id: 3, title: "Get the mobile shell on a real device", done: true },
  { id: 4, title: 'Figure out what a "task" actually is in Pace', done: false },
]

export default function App() {
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
      <Text style={styles.eyebrow}>Native shell · signed in</Text>

      <Text style={styles.section}>Sample tasks (hard-coded)</Text>
      {sampleTasks.map((task) => (
        <View key={task.id} style={styles.task}>
          <View style={[styles.checkbox, task.done && styles.checkboxDone]}>
            {task.done ? <Text style={styles.check}>✓</Text> : null}
          </View>
          <Text style={[styles.taskText, task.done && styles.taskTextDone]}>{task.title}</Text>
        </View>
      ))}

      <Text style={styles.footer}>
        Still fake data — but the account above is real, authenticated against the same API the web
        and desktop apps use.
      </Text>
    </ScrollView>
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
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#737373",
    marginTop: 12,
  },
  section: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#a3a3a3",
    marginTop: 28,
    marginBottom: 8,
  },
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
  footer: { color: "#525252", fontSize: 12, marginTop: 32, lineHeight: 18 },
})
