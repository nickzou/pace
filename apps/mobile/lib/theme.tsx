import { color, colorLight } from "@pace/tokens"
import * as SecureStore from "expo-secure-store"
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react"
import { useColorScheme } from "react-native"

// Runtime light/dark theming for native — the mobile twin of apps/web's lib/theme.tsx.
// There are no CSS vars on native, so instead of restyling the DOM we swap which
// @pace/tokens palette (`color` = dark, `colorLight` = light) the StyleSheets read
// from, and re-run StyleSheet.create when it changes (see useThemedStyles). The user's
// preference is System (follow the OS), Light, or Dark; System resolves via RN's
// useColorScheme(). Persisted in SecureStore so it survives relaunch.
export type ThemePref = "system" | "light" | "dark"
export type Scheme = "light" | "dark"
// `colorLight` has the same keys as `color` (enforced in @pace/tokens), so either
// palette satisfies this type and components can read any semantic colour off it.
// Values are widened to `string` — the two palettes have different literal hexes, so
// a `typeof color` type (narrowed by `as const`) would reject `colorLight`.
export type Palette = Record<keyof typeof color, string>

const STORAGE_KEY = "pace.theme"

const palettes: Record<Scheme, Palette> = { dark: color, light: colorLight }

function readStoredPref(): ThemePref {
  try {
    const v = SecureStore.getItem(STORAGE_KEY)
    return v === "light" || v === "dark" || v === "system" ? v : "system"
  } catch {
    // SecureStore can throw on a locked device / unsupported platform — fall back to
    // following the system rather than crashing the whole app at first render.
    return "system"
  }
}

type ThemeContextValue = {
  pref: ThemePref
  setPref: (pref: ThemePref) => void
  scheme: Scheme // the resolved scheme (System collapsed to light/dark)
  colors: Palette
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The OS appearance: "light" | "dark" | null (null → assume light).
  const system = useColorScheme()
  const [pref, setPrefState] = useState<ThemePref>(readStoredPref)

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next)
    try {
      SecureStore.setItem(STORAGE_KEY, next)
    } catch {
      // Non-fatal: the choice just won't persist to the next launch.
    }
  }, [])

  const scheme: Scheme = pref === "system" ? (system === "dark" ? "dark" : "light") : pref
  const colors = palettes[scheme]

  const value = useMemo<ThemeContextValue>(
    () => ({ pref, setPref, scheme, colors }),
    [pref, setPref, scheme, colors],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}

// Build a component's StyleSheet from the active palette, rebuilt only when the theme
// changes. Define `factory` at module scope so its identity is stable across renders
// (its result is memoised on the palette). Replaces module-level StyleSheet.create,
// which can't react to a theme swap.
export function useThemedStyles<T>(factory: (c: Palette) => T): T {
  const { colors } = useTheme()
  return useMemo(() => factory(colors), [colors, factory])
}
