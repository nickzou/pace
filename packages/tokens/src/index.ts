// Pace design tokens — the single source of truth for colour, spacing, type, and
// radii, shared across web · desktop · mobile (P2-10). Plain data so every surface
// can consume it: the web maps these into its Tailwind theme, mobile into a
// StyleSheet theme (see subtask 2). This is the "Aurora" theme — a deep, indigo-
// tinted dark chrome with a blue→indigo brand gradient — chosen from the design
// concept explorations (/concept-aurora). Re-theming only changes values here.

// Raw palette — the hues the semantic tokens draw from, inlined so non-Tailwind
// consumers (React Native) have the hex values too. The `ink` scale is the dark
// chrome (bg → surfaces → borders); `fg` is the cool, lavender-tinted foreground.
export const palette = {
  ink: {
    950: "#0b0a14", // app background
    900: "#12111b", // raised panel
    850: "#16151f", // cards, bars
    800: "#212029", // hairline border
    700: "#32313a", // emphasis border
  },
  fg: {
    100: "#f4f2ff", // primary text
    300: "#a7a3c8", // secondary text
    500: "#6d6a92", // muted text
    700: "#4a4869", // faint / placeholder
  },
  blue: { 300: "#93c5fd", 400: "#60a5fa" },
  indigo: { 400: "#818cf8", 500: "#6366f1" },
  emerald: { 400: "#34d399", 500: "#10b981" },
  rose: { 400: "#fb7185", 500: "#f43f5e" },
  amber: { 400: "#fbbf24" },
} as const

// Semantic colours — the layer UI should reference. Names describe ROLE, not hue,
// so a re-theme only changes values here. This is the dark theme (the default on
// every surface); `colorLight` below is the light counterpart.
export const color = {
  background: palette.ink[950], // app background
  surface: palette.ink[850], // cards, bars, panels
  surfaceInput: palette.ink[950], // input fields
  border: palette.ink[800],
  borderStrong: palette.ink[700], // focus / emphasis borders

  textPrimary: palette.fg[100],
  textSecondary: palette.fg[300],
  textMuted: palette.fg[500],
  textFaint: palette.fg[700], // placeholders, disabled

  primary: palette.blue[400],
  primaryHover: palette.blue[300],
  onPrimary: palette.ink[950], // text/icon on a primary fill

  success: palette.emerald[500],
  successText: palette.emerald[400],
  danger: palette.rose[500],
  dangerText: palette.rose[400], // e.g. an overdue due date
  warning: palette.amber[400], // e.g. a due-today date

  brandFrom: palette.blue[400], // the "Pace" wordmark gradient…
  brandTo: palette.indigo[500], // …end stop
} as const

// Light theme — the same Aurora identity inverted: a lavender-white ground, white
// surfaces, dark-indigo text, and deeper accents/status colours that stay legible on
// light. Same semantic keys as `color`, so every surface can swap the two: the web
// maps both onto the same CSS vars, and mobile picks the palette at runtime (see
// apps/mobile/lib/theme.tsx). Dark is the default; light is opt-in per user.
export const colorLight = {
  background: "#f4f5fb",
  surface: "#ffffff",
  surfaceInput: "#ffffff",
  border: "rgba(30,27,75,0.10)",
  borderStrong: "rgba(30,27,75,0.22)",

  textPrimary: "#211f38",
  textSecondary: "#4b4869",
  textMuted: "#6b6890",
  textFaint: "#9995b3",

  primary: "#3b82f6",
  primaryHover: "#2563eb",
  onPrimary: "#ffffff",

  success: "#059669",
  successText: "#047857",
  danger: "#dc2626",
  dangerText: "#dc2626",
  warning: "#d97706",

  brandFrom: "#3b82f6",
  brandTo: "#6366f1",
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

// Shadows. The Aurora "underglow" — a hairline top ring plus a soft, primary-tinted
// drop shadow — is what lifts cards/buttons off the dark background. The tint mirrors
// `color.primary` (#60a5fa → rgb 96,165,250); keep it in sync when re-theming.
export const shadow = {
  glow: "0 0 0 1px rgba(255,255,255,0.04), 0 10px 34px rgba(96,165,250,0.20)",
} as const

// Light-theme underglow: softer, with a faint dark hairline instead of the light ring.
export const shadowLight = {
  glow: "0 1px 2px rgba(30,27,75,0.06), 0 12px 30px rgba(59,130,246,0.16)",
} as const

// Status palette (P2-03) — the fixed set of 12 colours a user can assign to a custom
// status. Theme-aware like `color`/`colorLight`: a status stores the KEY (e.g. "green")
// and the app resolves the hex for the active theme. Dark values run brighter, light
// values deeper, so each reads on its own ground. STATUS_COLORS is the source of truth
// for the validation enum (`@pace/validation`).
export const STATUS_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
] as const
export type StatusColor = (typeof STATUS_COLORS)[number]

export const statusColor: Record<StatusColor, string> = {
  slate: "#94a3b8",
  red: "#f87171",
  orange: "#fb923c",
  amber: "#fbbf24",
  lime: "#a3e635",
  green: "#4ade80",
  teal: "#2dd4bf",
  cyan: "#22d3ee",
  blue: "#60a5fa",
  indigo: "#818cf8",
  violet: "#a78bfa",
  pink: "#f472b6",
} as const

export const statusColorLight: Record<StatusColor, string> = {
  slate: "#64748b",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  lime: "#65a30d",
  green: "#22c55e",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  pink: "#ec4899",
} as const

export const tokens = {
  palette,
  color,
  colorLight,
  space,
  radius,
  fontSize,
  fontWeight,
  shadow,
  shadowLight,
  statusColor,
  statusColorLight,
} as const
