import { colorLight, shadowLight } from "@pace/tokens"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

// Runtime light/dark theming. The Tailwind config maps every semantic colour to a CSS
// var with the DARK token as its fallback, so dark needs no vars set (it's the default,
// SSR included). Switching to light just sets those vars from @pace/tokens `colorLight`
// on <html>; switching back removes them. Web-only for now — the RN app themes itself.
export type Theme = "dark" | "light"

export const STORAGE_KEY = "pace.theme"

// CSS var → light value. Keys match the var names in tailwind.config.ts. A few roles
// diverge from the dark mapping so they stay legible on a light ground (accent gets a
// visible tint rather than a border colour; destructive text goes white on the red).
// Exported so the inline pre-hydration script (__root.tsx `ThemeScript`) applies the
// exact same vars this module does at runtime.
export const LIGHT_VARS: Record<string, string> = {
  "--background": colorLight.background,
  "--foreground": colorLight.textPrimary,
  "--card": colorLight.surface,
  "--card-foreground": colorLight.textPrimary,
  "--popover": colorLight.surface,
  "--popover-foreground": colorLight.textPrimary,
  "--primary": colorLight.primary,
  "--primary-foreground": colorLight.onPrimary,
  "--secondary": colorLight.surface,
  "--secondary-foreground": colorLight.textPrimary,
  "--muted": colorLight.surface,
  "--muted-foreground": colorLight.textMuted,
  "--accent": "rgba(99,102,241,0.10)",
  "--accent-foreground": colorLight.textPrimary,
  "--destructive": colorLight.danger,
  "--destructive-foreground": "#ffffff",
  "--border": colorLight.border,
  "--input": colorLight.borderStrong,
  "--ring": colorLight.primary,
  "--success": colorLight.success,
  "--warning": colorLight.warning,
  "--brand-from": colorLight.brandFrom,
  "--brand-to": colorLight.brandTo,
  "--glow": shadowLight.glow,
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "light") {
    for (const [k, val] of Object.entries(LIGHT_VARS)) root.style.setProperty(k, val)
    root.style.colorScheme = "light"
  } else {
    for (const k of Object.keys(LIGHT_VARS)) root.style.removeProperty(k)
    root.style.colorScheme = "dark"
  }
}

// useLayoutEffect on the client (applies before paint → no flash), useEffect on the
// server (no-op, avoids the SSR warning).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void }
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start "dark" so the first client render matches the SSR HTML (which is always dark
  // — see tailwind.config.ts), avoiding a hydration mismatch on theme-dependent UI like
  // the settings toggle. The inline ThemeScript in <head> has already applied the stored
  // theme's vars before paint, so there's no flash; we reconcile React state on mount.
  const [theme, setThemeState] = useState<Theme>("dark")
  const applied = useRef(false)

  useIsoLayoutEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark"
    setThemeState(stored)
  }, [])

  useIsoLayoutEffect(() => {
    // Skip the first run: the inline ThemeScript already put the DOM in the right state,
    // so re-applying here would needlessly clear then re-set the vars. Apply on every
    // change after mount (the settings toggle).
    if (!applied.current) {
      applied.current = true
      return
    }
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, next)
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
