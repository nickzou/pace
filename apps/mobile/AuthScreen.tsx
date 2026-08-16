import { useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { signIn, signUp } from "./lib/auth-client"
import { type Palette, useTheme, useThemedStyles } from "./lib/theme"

type Mode = "sign-in" | "sign-up"

export function AuthScreen() {
  const styles = useThemedStyles(makeStyles)
  const { colors } = useTheme()
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
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          value={name}
          onChangeText={setName}
        />
      )}
      <TextInput
        testID="email-input"
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textFaint}
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
        placeholderTextColor={colors.textFaint}
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
          <ActivityIndicator color={colors.onPrimary} />
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

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
    brand: { fontSize: 40, fontWeight: "700", color: c.textPrimary },
    tag: { fontSize: 15, color: c.textSecondary, marginBottom: 12 },
    input: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceInput,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 14,
      color: c.textPrimary,
      fontSize: 15,
    },
    error: { color: c.dangerText, fontSize: 14 },
    button: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
    },
    buttonText: { color: c.onPrimary, fontSize: 15, fontWeight: "600" },
    switch: { color: c.primary, fontSize: 14, textAlign: "center", marginTop: 8 },
  })
