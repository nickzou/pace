import { color, fontSize, fontWeight, palette, radius, space } from "@pace/tokens"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"

// A live view of @pace/tokens — the design-system reference page (P2-10). Renders
// straight from the token values (inline styles), so it's a faithful picture of the
// package, not a Tailwind approximation. Grows to include components (subtasks 3–5).
export const Route = createFileRoute("/design")({ component: Design })

const mono = "ui-monospace, SFMono-Regular, monospace"

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: space[12] }}>
      <h2
        style={{
          fontSize: fontSize.sm,
          fontWeight: Number(fontWeight.semibold),
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: color.textSecondary,
          marginBottom: space[4],
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space[1] }}>
      <div
        style={{
          height: 56,
          borderRadius: radius.md,
          background: value,
          border: `1px solid ${color.border}`,
        }}
      />
      <div style={{ fontSize: fontSize.xs, color: color.textPrimary }}>{name}</div>
      <div style={{ fontSize: fontSize.xs, color: color.textMuted, fontFamily: mono }}>{value}</div>
    </div>
  )
}

function Design() {
  return (
    <main
      style={{
        background: color.background,
        color: color.textPrimary,
        minHeight: "100vh",
        padding: space[8],
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: fontSize["3xl"],
            fontWeight: Number(fontWeight.bold),
            margin: 0,
            backgroundImage: `linear-gradient(to right, ${color.brandFrom}, ${color.brandTo})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            width: "fit-content",
          }}
        >
          Pace — Design Tokens
        </h1>
        <p style={{ color: color.textSecondary, marginTop: space[2], marginBottom: space[12] }}>
          <code style={{ fontFamily: mono }}>@pace/tokens</code>, rendered live — the single
          source for web · desktop · mobile.
        </p>

        <Section title="Semantic colours">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: space[4],
            }}
          >
            {Object.entries(color).map(([name, value]) => (
              <Swatch key={name} name={name} value={value} />
            ))}
          </div>
        </Section>

        <Section title="Palette">
          <div style={{ display: "flex", flexDirection: "column", gap: space[4] }}>
            {Object.entries(palette).map(([family, shades]) => (
              <div key={family}>
                <div style={{ fontSize: fontSize.xs, color: color.textMuted, marginBottom: space[1] }}>
                  {family}
                </div>
                <div style={{ display: "flex", gap: space[1], flexWrap: "wrap" }}>
                  {Object.entries(shades).map(([shade, hex]) => (
                    <div
                      key={shade}
                      title={`${family}-${shade} · ${hex}`}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: radius.sm,
                        background: hex,
                        border: `1px solid ${color.border}`,
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        fontSize: 10,
                        color: color.textPrimary,
                        paddingBottom: 3,
                      }}
                    >
                      {shade}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Spacing">
          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            {Object.entries(space).map(([name, val]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: space[3] }}>
                <div
                  style={{ width: 24, fontSize: fontSize.xs, color: color.textMuted, fontFamily: mono }}
                >
                  {name}
                </div>
                <div
                  style={{ height: 12, width: val, background: color.primary, borderRadius: radius.sm }}
                />
                <div style={{ fontSize: fontSize.xs, color: color.textMuted }}>{val}px</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Radii">
          <div style={{ display: "flex", gap: space[5], flexWrap: "wrap" }}>
            {Object.entries(radius).map(([name, val]) => (
              <div
                key={name}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: space[1] }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    background: color.surface,
                    border: `1px solid ${color.borderStrong}`,
                    borderRadius: val,
                  }}
                />
                <div style={{ fontSize: fontSize.xs, color: color.textMuted }}>
                  {name} · {val}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type scale">
          <div style={{ display: "flex", flexDirection: "column", gap: space[3] }}>
            {Object.entries(fontSize).map(([name, val]) => (
              <div key={name} style={{ display: "flex", alignItems: "baseline", gap: space[4] }}>
                <div
                  style={{ width: 32, fontSize: fontSize.xs, color: color.textMuted, fontFamily: mono }}
                >
                  {name}
                </div>
                <div style={{ fontSize: val }}>The quick brown fox</div>
                <div style={{ fontSize: fontSize.xs, color: color.textMuted }}>{val}px</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Font weights">
          <div style={{ display: "flex", flexDirection: "column", gap: space[2] }}>
            {Object.entries(fontWeight).map(([name, val]) => (
              <div key={name} style={{ fontSize: fontSize.lg, fontWeight: Number(val) }}>
                {name} — The quick brown fox ({val})
              </div>
            ))}
          </div>
        </Section>
      </div>
    </main>
  )
}
