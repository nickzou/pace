import { color } from "@pace/tokens"

// Loaded by Tailwind v4 via `@config` in src/styles.css. Maps @pace/tokens into the
// theme so semantic utilities (bg-surface, text-foreground, border-border, …) come
// from the tokens — the single source shared with mobile. `extend` (not replace)
// keeps Tailwind's default neutral-*/sky-* utilities working during the migration.
export default {
  theme: {
    extend: {
      colors: {
        background: color.background,
        surface: color.surface,
        "surface-input": color.surfaceInput,
        border: color.border,
        "border-strong": color.borderStrong,
        foreground: color.textPrimary,
        "foreground-muted": color.textSecondary,
        "foreground-subtle": color.textMuted,
        "foreground-faint": color.textFaint,
        primary: color.primary,
        "primary-hover": color.primaryHover,
        "on-primary": color.onPrimary,
        success: color.success,
        danger: color.danger,
        warning: color.warning,
        brand: { from: color.brandFrom, to: color.brandTo },
      },
    },
  },
}
