// Pace design tokens — the single source of truth for colour, spacing, type, and
// radii, shared across web · desktop · mobile (P2-10). Plain data so every surface
// can consume it: the web maps these into its Tailwind theme, mobile into a
// StyleSheet theme (see subtask 2). Values are codified from the current UI — the
// app already uses one palette (Tailwind's neutral + sky/emerald/red/yellow; the
// mobile hexes ARE those Tailwind values), so this just names it.

// Raw palette — the Tailwind shades in use, inlined so non-Tailwind consumers
// (React Native) have the hex values too. Semantic tokens below draw from this.
export const palette = {
  neutral: {
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#d4d4d4",
    400: "#a3a3a3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
    950: "#0a0a0a",
  },
  sky: { 300: "#7dd3fc", 400: "#38bdf8", 500: "#0ea5e9" },
  emerald: { 400: "#34d399", 500: "#10b981" },
  red: { 300: "#fca5a5", 400: "#f87171", 500: "#ef4444" },
  yellow: { 300: "#fde047", 400: "#facc15", 500: "#eab308" },
  indigo: { 400: "#818cf8" },
} as const

// Semantic colours — the layer UI should reference. Names describe ROLE, not hue,
// so a re-theme only changes values here. Dark theme (the app is dark-only for now).
export const color = {
  background: palette.neutral[950], // app background
  surface: palette.neutral[900], // cards, bars, panels
  surfaceInput: palette.neutral[950], // input fields
  border: palette.neutral[800],
  borderStrong: palette.neutral[700], // focus / emphasis borders

  textPrimary: palette.neutral[100],
  textSecondary: palette.neutral[400],
  textMuted: palette.neutral[500],
  textFaint: palette.neutral[600], // placeholders, disabled

  primary: palette.sky[500],
  primaryHover: palette.sky[400],
  onPrimary: palette.neutral[950], // text/icon on a primary fill

  success: palette.emerald[500],
  successText: palette.emerald[400],
  danger: palette.red[500],
  dangerText: palette.red[400], // e.g. an overdue due date
  warning: palette.yellow[400], // e.g. a due-today date

  brandFrom: palette.sky[400], // the "Pace" wordmark gradient…
  brandTo: palette.indigo[400], // …end stop
} as const

// Spacing — 4px base, matching the Tailwind scale the app uses (gap-2/3, px-3, py-2…).
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

// Corner radii (Tailwind: rounded-md 6, rounded-lg 8, rounded-xl 12, rounded-full).
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 9999,
} as const

// Type scale (px) + weights. Font family is the platform default for now.
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "5xl": 48,
} as const

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const

export const tokens = { palette, color, space, radius, fontSize, fontWeight } as const
