import { describe, expect, it } from "vitest"
import tailwindConfig from "../../tailwind.config"
import { LIGHT_VARS } from "./theme"

// Light mode is wired through CSS variables in two INDEPENDENT places:
//   - tailwind.config.ts maps each semantic colour to `var(--x, <dark fallback>)`
//   - lib/theme.tsx's LIGHT_VARS supplies each `--x`'s light value (consumed by both
//     the runtime ThemeProvider and the pre-hydration inline script in __root.tsx)
// TypeScript can't cross-check them — they're plain strings on both sides — so a var
// added to one but not the other silently breaks light mode for that role (no override
// applied, or an override nothing reads). This guards that coupling.

// Every CSS var NAME the Tailwind theme reads, e.g. "var(--background, #0b0a14)" → "background".
function tailwindVarNames(): Set<string> {
  const { colors, boxShadow } = tailwindConfig.theme.extend
  const values = [...Object.values(colors), ...Object.values(boxShadow)]
  const names = new Set<string>()
  for (const value of values) {
    const name = /var\(--([^,)\s]+)/.exec(value)?.[1]
    if (name) names.add(name)
  }
  return names
}

const lightVarNames = new Set(Object.keys(LIGHT_VARS).map((key) => key.replace(/^--/, "")))

describe("light theme ↔ Tailwind CSS var parity", () => {
  it("every Tailwind var has a light-mode value in LIGHT_VARS", () => {
    const missing = [...tailwindVarNames()].filter((name) => !lightVarNames.has(name))
    expect(missing).toEqual([])
  })

  it("every LIGHT_VARS override maps to a real Tailwind var (no dead overrides)", () => {
    const twNames = tailwindVarNames()
    const dead = [...lightVarNames].filter((name) => !twNames.has(name))
    expect(dead).toEqual([])
  })
})
