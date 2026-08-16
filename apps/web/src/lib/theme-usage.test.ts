import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// Every colour in the app must come from a SEMANTIC token class (bg-card,
// text-foreground, border-border, text-primary, and success/warning/destructive)
// — never a raw Tailwind palette class (bg-neutral-900, text-sky-400, …). Raw
// palette colours are fixed hexes that ignore the light/dark CSS vars, so a
// component using them silently stays dark in light mode. That's the class of bug
// that only surfaced under manual inspection; this catches it in CI instead.
//
// Guards token USAGE; the tokens.test.ts / theme.test.ts parity tests guard the
// token DEFINITIONS. Together: the palette is complete AND components consume it.
//
// `black`/`white` (scrims/overlays like bg-black/60) have no numeric scale, so
// they're intentionally allowed. This test file and generated files are skipped.
const FORBIDDEN =
  /\b(?:bg|text|border|ring|placeholder|from|to|via|divide|outline|fill|stroke|decoration|caret|accent)-(?:neutral|zinc|gray|slate|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g

// apps/web/src — the parent of this file's lib/ directory.
const SRC = fileURLToPath(new URL("..", import.meta.url))

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue
    const full = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      entry.name !== "routeTree.gen.ts"
    ) {
      out.push(full)
    }
  }
  return out
}

describe("semantic token usage", () => {
  it("no raw Tailwind palette colour classes (use token classes so light mode works)", () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const matches = readFileSync(file, "utf8").match(FORBIDDEN)
      if (matches) offenders.push(`${file.slice(SRC.length)}: ${[...new Set(matches)].join(", ")}`)
    }
    expect(offenders).toEqual([])
  })
})
