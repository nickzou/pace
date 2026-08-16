import { color, shadow } from "@pace/tokens"

// Loaded by Tailwind v4 via `@config` in src/styles.css. Maps @pace/tokens onto the
// colour names shadcn/ui components expect (background/foreground/primary/…). Each
// value is a CSS var whose FALLBACK is the dark token — so with no var set the app is
// the dark Aurora theme (SSR included), exactly as before. The theme provider
// (lib/theme.tsx) sets the vars to `colorLight` to switch to light mode at runtime.
const v = (name: string, fallback: string) => `var(--${name}, ${fallback})`

export default {
  theme: {
    extend: {
      colors: {
        background: v("background", color.background),
        foreground: v("foreground", color.textPrimary),
        card: v("card", color.surface),
        "card-foreground": v("card-foreground", color.textPrimary),
        popover: v("popover", color.surface),
        "popover-foreground": v("popover-foreground", color.textPrimary),
        primary: v("primary", color.primary),
        "primary-foreground": v("primary-foreground", color.onPrimary),
        secondary: v("secondary", color.surface),
        "secondary-foreground": v("secondary-foreground", color.textPrimary),
        muted: v("muted", color.surface),
        "muted-foreground": v("muted-foreground", color.textSecondary),
        accent: v("accent", color.border),
        "accent-foreground": v("accent-foreground", color.textPrimary),
        destructive: v("destructive", color.danger),
        "destructive-foreground": v("destructive-foreground", color.textPrimary),
        border: v("border", color.border),
        input: v("input", color.borderStrong),
        ring: v("ring", color.primary),
        // Pace extras beyond shadcn's set:
        success: v("success", color.success),
        warning: v("warning", color.warning),
        "brand-from": v("brand-from", color.brandFrom),
        "brand-to": v("brand-to", color.brandTo),
      },
      boxShadow: {
        // Aurora underglow (see @pace/tokens `shadow`); use as `shadow-glow`.
        glow: v("glow", shadow.glow),
      },
    },
  },
}
