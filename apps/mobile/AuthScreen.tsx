import { useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { signIn, signUp } from "./lib/auth-client"

type Mode = "sign-in" | "sign-up"

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("sign-in")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const isSignUp = mode === "sign-up"

  async function submit() {
    setPending(true)
    setError(null)
    const result = isSignUp
      ? await signUp.email({ name, email, password })
      : await signIn.email({ email, password })
    setPending(false)
    if (result.error) {
      setError(result.error.message ?? "Something went wrong")
    }
    // On success, useSession() in App re-renders to the signed-in view.
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Pace</Text>
      <Text style={styles.tag}>{isSignUp ? "Create your account" : "Welcome back"}</Text>

      {isSignUp && (
        <TextInput
          testID="name-input"
          style={styles.input}
          placeholder="Name"
          placeholderTextColor="#525252"
          autoCapitalize="words"
          value={name}
          onChangeText={setName}
        />
      )}
      <TextInput
        testID="email-input"
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#525252"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        testID="password-input"
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#525252"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? (
        <Text testID="auth-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable testID="submit-button" style={styles.button} onPress={submit} disabled={pending}>
        {pending ? (
          <ActivityIndicator color="#0a0a0a" />
        ) : (
          <Text style={styles.buttonText}>{isSignUp ? "Sign up" : "Sign in"}</Text>
        )}
      </Pressable>

      <Pressable
        testID="mode-toggle"
        onPress={() => {
          setMode(isSignUp ? "sign-in" : "sign-up")
          setError(null)
          // Reset the form when switching modes so a half-typed sign-in doesn't
          // bleed into sign-up (and vice versa).
          setName("")
          setEmail("")
          setPassword("")
        }}
      >
        <Text style={styles.switch}>
          {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  brand: { fontSize: 40, fontWeight: "700", color: "#e5e5e5" },
  tag: { fontSize: 15, color: "#a3a3a3", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#404040",
    backgroundColor: "#171717",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: "#e5e5e5",
    fontSize: 15,
  },
  error: { color: "#f87171", fontSize: 14 },
  button: {
    backgroundColor: "#0ea5e9",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: "#0a0a0a", fontSize: 15, fontWeight: "600" },
  switch: { color: "#38bdf8", fontSize: 14, textAlign: "center", marginTop: 8 },
})
