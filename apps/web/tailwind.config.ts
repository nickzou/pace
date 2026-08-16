import { color, shadow } from "@pace/tokens"

// Loaded by Tailwind v4 via `@config` in src/styles.css. Maps @pace/tokens onto the
// colour names shadcn/ui components expect (background/foreground/primary/
// muted-foreground/border/ring/destructive/…), so shadcn works with plain Tailwind
// utilities — no CSS-variable layer (the app is dark-only, one theme). `extend` (not
// replace) keeps Tailwind's default neutral-*/sky-* utilities during the migration.
export default {
  theme: {
    extend: {
      colors: {
        background: color.background,
        foreground: color.textPrimary,
        card: color.surface,
        "card-foreground": color.textPrimary,
        popover: color.surface,
        "popover-foreground": color.textPrimary,
        primary: color.primary,
        "primary-foreground": color.onPrimary,
        secondary: color.surface,
        "secondary-foreground": color.textPrimary,
        muted: color.surface,
        "muted-foreground": color.textSecondary,
        accent: color.border,
        "accent-foreground": color.textPrimary,
        destructive: color.danger,
        "destructive-foreground": color.textPrimary,
        border: color.border,
        input: color.borderStrong,
        ring: color.primary,
        // Pace extras beyond shadcn's set:
        success: color.success,
        warning: color.warning,
      },
      boxShadow: {
        // Aurora underglow (see @pace/tokens `shadow`); use as `shadow-glow`.
        glow: shadow.glow,
      },
    },
  },
}
