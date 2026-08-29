import { isPasswordValid, passwordChecks } from "@pace/validation"
import { Check, Circle, Eye, EyeOff } from "lucide-react-native"
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
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const isSignUp = mode === "sign-up"
  // On sign-up the password must satisfy the shared policy (@pace/validation) before we let the
  // request go out; sign-in accepts any existing password.
  const canSubmit = !pending && (!isSignUp || isPasswordValid(password))

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
      <View style={styles.passwordRow}>
        <TextInput
          testID="password-input"
          style={[styles.input, styles.passwordInput]}
          placeholder="Password"
          placeholderTextColor={colors.textFaint}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          testID="password-peek"
          style={styles.peek}
          onPress={() => setShowPassword((s) => !s)}
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          hitSlop={8}
        >
          {showPassword ? (
            <EyeOff size={18} color={colors.textSecondary} />
          ) : (
            <Eye size={18} color={colors.textSecondary} />
          )}
        </Pressable>
      </View>

      {isSignUp ? (
        <View testID="password-checklist" style={styles.checklist}>
          {passwordChecks(password).map((check) => (
            <View key={check.key} style={styles.checkItem}>
              {check.ok ? (
                <Check size={14} color={colors.successText} />
              ) : (
                <Circle size={14} color={colors.textFaint} />
              )}
              <Text style={[styles.checkLabel, check.ok && styles.checkLabelOk]}>
                {check.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {error ? (
        <Text testID="auth-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <Pressable
        testID="submit-button"
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={submit}
        disabled={!canSubmit}
      >
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
          setShowPassword(false)
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
    passwordRow: { position: "relative", justifyContent: "center" },
    passwordInput: { paddingRight: 44 },
    peek: {
      position: "absolute",
      right: 0,
      height: "100%",
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    checklist: { gap: 4, marginTop: -4 },
    checkItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    checkLabel: { color: c.textFaint, fontSize: 13 },
    checkLabelOk: { color: c.successText },
    button: {
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: c.onPrimary, fontSize: 15, fontWeight: "600" },
    switch: { color: c.primary, fontSize: 14, textAlign: "center", marginTop: 8 },
  })
