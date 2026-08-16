import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { type Palette, useThemedStyles } from "./theme"

// A single-slot toast with an optional action button (used for Undo) — the mobile
// twin of apps/web's toast. Lives above the whole app so a toast raised from
// inside the detail modal is still visible after the modal closes. Renders a
// bottom overlay; taps pass through everywhere except the toast itself.
type ToastAction = { label: string; onClick: () => void }
type Toast = { message: string; action?: ToastAction }
type ToastContextValue = { show: (message: string, action?: ToastAction) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles)
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setToast(null)
  }, [])

  const show = useCallback((message: string, action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ message, action })
    timer.current = setTimeout(() => setToast(null), TOAST_MS)
  }, [])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <ToastContext.Provider value={{ show }}>
      <View style={styles.root}>
        {children}
        {toast ? (
          <View style={styles.wrap} pointerEvents="box-none">
            <View style={styles.toast}>
              <Text style={styles.text}>{toast.message}</Text>
              {toast.action ? (
                <Pressable
                  testID="toast-action"
                  onPress={() => {
                    toast.action?.onClick()
                    dismiss()
                  }}
                >
                  <Text style={styles.action}>{toast.action.label}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within a ToastProvider")
  return ctx
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1 },
    wrap: { position: "absolute", left: 0, right: 0, bottom: 40, alignItems: "center" },
    toast: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surface,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    text: { color: c.textPrimary, fontSize: 14 },
    action: { color: c.primary, fontSize: 14, fontWeight: "600" },
  })
