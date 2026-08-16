import { color, colorLight, shadow, shadowLight } from "@pace/tokens"
import { describe, expect, it } from "vitest"

// The cross-surface light/dark swap (web CSS vars + mobile palette swap) assumes the
// light and dark palettes expose IDENTICAL keys — a role in one but not the other means
// that surface can't theme it. TypeScript only partly covers this (mobile's Palette type
// forces colorLight ⊇ color, but not the reverse, nor typos/extra keys), so assert full
// parity here. Lives in the web suite so it runs in an existing node-env vitest that CI
// already invokes; @pace/tokens is a direct web dependency.

describe("@pace/tokens palette parity", () => {
  it("colorLight has exactly the same keys as color", () => {
    expect(Object.keys(colorLight).sort()).toEqual(Object.keys(color).sort())
  })

  it("shadowLight has exactly the same keys as shadow", () => {
    expect(Object.keys(shadowLight).sort()).toEqual(Object.keys(shadow).sort())
  })

  it("every palette value is a non-empty string", () => {
    for (const palette of [color, colorLight]) {
      for (const [key, value] of Object.entries(palette)) {
        expect(value, key).toBeTypeOf("string")
        expect(value.length, key).toBeGreaterThan(0)
      }
    }
  })
})
