import { createFileRoute, notFound } from "@tanstack/react-router"
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Flag,
  Hash,
  Inbox,
  ListTodo,
  Plus,
  Search,
  Settings,
  Sun,
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { ConceptSwitcher, GROUPS, type State, TASKS } from "#/components/concept-kit"

// Dev-only. Same Sidebar LAYOUT as /concepts, but a swappable VISUAL LANGUAGE — the
// switcher up top swaps the whole aesthetic (palette, type, radius, shadow, chrome)
// while the structure stays put, so it's a pure comparison of visual style.
export const Route = createFileRoute("/concept-styles")({
  beforeLoad: () => {
    if (import.meta.env.PROD) throw notFound()
  },
  component: Styles,
})

type Theme = {
  key: string
  name: string
  blurb: string
  font: string
  headingFont: string
  headingWeight: number
  uppercaseLabels: boolean
  radius: number
  bg: string
  panel: string
  card: string
  border: string
  borderStrong: string
  text: string
  textMuted: string
  textFaint: string
  accent: string
  accentGradient?: string
  accentText: string
  accentSoft: string
  overdue: string
  today: string
  dots: Record<"Work" | "Personal" | "Inbox", string>
  shadow: string
}

const THEMES: Theme[] = [
  {
    key: "paper",
    name: "Paper",
    blurb: "Warm light minimalism — soft shadows, teal accent",
    font: "'Inter', system-ui, sans-serif",
    headingFont: "'Inter', system-ui, sans-serif",
    headingWeight: 700,
    uppercaseLabels: false,
    radius: 12,
    bg: "#faf9f7",
    panel: "#f2f0ea",
    card: "#ffffff",
    border: "#e8e3da",
    borderStrong: "#d7d0c4",
    text: "#2b2926",
    textMuted: "#6f6a62",
    textFaint: "#a8a094",
    accent: "#0f766e",
    accentText: "#ffffff",
    accentSoft: "rgba(15,118,110,0.10)",
    overdue: "#b91c1c",
    today: "#b45309",
    dots: { Work: "#0f766e", Personal: "#c2410c", Inbox: "#a8a094" },
    shadow: "0 1px 2px rgba(30,25,20,0.04), 0 2px 6px rgba(30,25,20,0.06)",
  },
  {
    key: "editorial",
    name: "Editorial",
    blurb: "High-contrast Swiss — sharp corners, serif heads, red accent",
    font: "'Inter', system-ui, sans-serif",
    headingFont: "Georgia, 'Times New Roman', serif",
    headingWeight: 700,
    uppercaseLabels: true,
    radius: 2,
    bg: "#ffffff",
    panel: "#ffffff",
    card: "#ffffff",
    border: "#e6e6e6",
    borderStrong: "#111111",
    text: "#0a0a0a",
    textMuted: "#565656",
    textFaint: "#9a9a9a",
    accent: "#dc2626",
    accentText: "#ffffff",
    accentSoft: "rgba(220,38,38,0.08)",
    overdue: "#dc2626",
    today: "#0a0a0a",
    dots: { Work: "#0a0a0a", Personal: "#dc2626", Inbox: "#9a9a9a" },
    shadow: "none",
  },
  {
    key: "aurora",
    name: "Aurora",
    blurb: "Vibrant dark — glassy surfaces, violet→pink gradient, glow",
    font: "'Inter', system-ui, sans-serif",
    headingFont: "'Inter', system-ui, sans-serif",
    headingWeight: 700,
    uppercaseLabels: false,
    radius: 16,
    bg: "#0b0a14",
    panel: "rgba(255,255,255,0.03)",
    card: "rgba(255,255,255,0.045)",
    border: "rgba(255,255,255,0.09)",
    borderStrong: "rgba(255,255,255,0.16)",
    text: "#f4f2ff",
    textMuted: "#a7a3c8",
    textFaint: "#6d6a92",
    accent: "#a855f7",
    accentGradient: "linear-gradient(135deg,#a855f7,#ec4899)",
    accentText: "#ffffff",
    accentSoft: "rgba(168,85,247,0.16)",
    overdue: "#fb7185",
    today: "#fbbf24",
    dots: { Work: "#a855f7", Personal: "#22d3ee", Inbox: "#6d6a92" },
    shadow: "0 0 0 1px rgba(255,255,255,0.04), 0 10px 34px rgba(168,85,247,0.16)",
  },
  {
    key: "nocturne",
    name: "Nocturne",
    blurb: "Cozy warm dark — brown-black, amber accent",
    font: "'Inter', system-ui, sans-serif",
    headingFont: "'Inter', system-ui, sans-serif",
    headingWeight: 700,
    uppercaseLabels: false,
    radius: 10,
    bg: "#1a1614",
    panel: "#221c19",
    card: "#26201b",
    border: "#352c26",
    borderStrong: "#4a3d34",
    text: "#f0e9e2",
    textMuted: "#b3a89c",
    textFaint: "#7a7066",
    accent: "#f59e0b",
    accentText: "#1a1614",
    accentSoft: "rgba(245,158,11,0.14)",
    overdue: "#f87171",
    today: "#fbbf24",
    dots: { Work: "#f59e0b", Personal: "#34d399", Inbox: "#7a7066" },
    shadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
]

function Styles() {
  const [themeKey, setThemeKey] = useState(THEMES[0]?.key ?? "paper")
  const [done, setDone] = useState<Set<string>>(new Set(["3"]))
  const t = THEMES.find((x) => x.key === themeKey) ?? THEMES[0]
  if (!t) return null
  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const label = t.uppercaseLabels
    ? { textTransform: "uppercase" as const, letterSpacing: "0.08em" }
    : {}

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.font }} className="flex h-screen">
      {/* Sidebar */}
      <aside
        style={{ background: t.panel, borderColor: t.border }}
        className="flex w-60 shrink-0 flex-col gap-6 border-r p-4"
      >
        <div
          style={{
            fontFamily: t.headingFont,
            fontWeight: t.headingWeight,
            background: t.accentGradient ?? t.accent,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
          className="px-2 text-2xl tracking-tight"
        >
          Pace
        </div>

        <nav className="flex flex-col gap-0.5">
          <Nav t={t} icon={<Sun />} name="Today" count={2} active />
          <Nav t={t} icon={<CalendarDays />} name="Upcoming" count={2} />
          <Nav t={t} icon={<AlertTriangle />} name="Overdue" count={2} danger />
          <Nav t={t} icon={<ListTodo />} name="All tasks" count={6} />
        </nav>

        <div className="flex flex-col gap-0.5">
          <div style={{ color: t.textFaint, ...label }} className="px-3 pb-1 text-xs font-semibold">
            Lists
          </div>
          <Nav t={t} icon={<Inbox />} name="Inbox" count={0} />
          <Nav t={t} icon={<Hash style={{ color: t.dots.Work }} />} name="Work" count={3} />
          <Nav t={t} icon={<Hash style={{ color: t.dots.Personal }} />} name="Personal" count={3} />
        </div>

        <button
          type="button"
          style={{ color: t.textMuted }}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm"
        >
          <span
            style={{
              background: t.accentGradient ?? t.accent,
              color: t.accentText,
              borderRadius: t.radius,
            }}
            className="flex size-7 items-center justify-center text-xs font-semibold"
          >
            NZ
          </span>
          <span className="min-w-0 flex-1 truncate">Nick Zou</span>
          <Settings className="size-4 shrink-0" />
        </button>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header
          style={{ borderColor: t.border }}
          className="flex items-center gap-4 border-b px-8 py-5"
        >
          <div className="min-w-0 flex-1">
            <h1
              style={{ fontFamily: t.headingFont, fontWeight: t.headingWeight, ...label }}
              className="text-2xl tracking-tight"
            >
              Today
            </h1>
            <p style={{ color: t.textMuted }} className="text-sm">
              Friday, August 15 · 2 overdue · 2 due today
            </p>
          </div>
          <div className="relative">
            <Search
              style={{ color: t.textFaint }}
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
            />
            <input
              placeholder="Search…"
              style={{
                background: t.card,
                borderColor: t.borderStrong,
                borderRadius: t.radius,
                color: t.text,
              }}
              className="w-56 border py-2 pl-9 pr-3 text-sm outline-none"
            />
          </div>
          <button
            type="button"
            style={{
              background: t.accentGradient ?? t.accent,
              color: t.accentText,
              borderRadius: t.radius,
              boxShadow: t.shadow,
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium"
          >
            <Plus className="size-4" /> Add task
          </button>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-8">
            {GROUPS.map((g) => {
              const tasks = TASKS.filter((x) => x.state === g.key)
              return (
                <section key={g.key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-1">
                    <h2
                      style={{
                        color: g.key === "overdue" ? t.overdue : t.text,
                        ...label,
                      }}
                      className="text-sm font-semibold"
                    >
                      {g.label}
                    </h2>
                    <span
                      style={{ background: t.accentSoft, color: t.textMuted, borderRadius: 999 }}
                      className="px-1.5 text-xs"
                    >
                      {tasks.length}
                    </span>
                  </div>
                  <div
                    style={{
                      background: t.card,
                      borderColor: t.border,
                      borderRadius: t.radius,
                      boxShadow: t.shadow,
                    }}
                    className="overflow-hidden border"
                  >
                    {tasks.map((task, i) => (
                      <Row
                        key={task.id}
                        t={t}
                        task={task}
                        done={done.has(task.id)}
                        onToggle={() => toggle(task.id)}
                        first={i === 0}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </main>

      {/* Style switcher (top-right, floating) */}
      <div
        style={{ background: t.panel, borderColor: t.border, boxShadow: t.shadow }}
        className="fixed right-4 top-4 z-50 flex flex-col gap-1 rounded-2xl border p-1.5"
      >
        <div
          style={{ color: t.textFaint }}
          className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        >
          Visual style
        </div>
        {THEMES.map((th) => {
          const on = th.key === themeKey
          return (
            <button
              type="button"
              key={th.key}
              onClick={() => setThemeKey(th.key)}
              style={{
                background: on ? t.accentSoft : "transparent",
                color: on ? t.text : t.textMuted,
                borderRadius: 12,
              }}
              className="flex items-center gap-2.5 px-2.5 py-1.5 text-left"
            >
              <span
                style={{ background: th.accentGradient ?? th.accent }}
                className="size-3 shrink-0 rounded-full"
              />
              <span className="text-xs font-medium">{th.name}</span>
            </button>
          )
        })}
      </div>
      <ConceptSwitcher current="/concept-styles" />
    </div>
  )
}

function Nav({
  t,
  icon,
  name,
  count,
  active,
  danger,
}: {
  t: Theme
  icon: ReactNode
  name: string
  count: number
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      style={{
        background: active ? t.accentSoft : "transparent",
        color: active ? t.text : t.textMuted,
        borderRadius: t.radius,
      }}
      className="flex items-center gap-3 px-3 py-2 text-left text-sm [&_svg]:size-4 [&_svg]:shrink-0"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {count > 0 ? (
        <span style={{ color: danger ? t.overdue : t.textFaint }} className="text-xs">
          {count}
        </span>
      ) : null}
    </button>
  )
}

function Row({
  t,
  task,
  done,
  onToggle,
  first,
}: {
  t: Theme
  task: (typeof TASKS)[number]
  done: boolean
  onToggle: () => void
  first: boolean
}) {
  const stateColor: Record<State, string> = {
    overdue: t.overdue,
    today: t.today,
    upcoming: t.textMuted,
  }
  return (
    <div
      style={{ borderTop: first ? "none" : `1px solid ${t.border}` }}
      className="flex items-center gap-3 px-4 py-3"
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          background: done ? t.accent : "transparent",
          borderColor: done ? t.accent : t.borderStrong,
          color: t.accentText,
          borderRadius: t.radius > 8 ? 999 : t.radius,
        }}
        className="flex size-5 shrink-0 items-center justify-center border-2"
      >
        {done ? <Check className="size-3" strokeWidth={3} /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <div
          style={{
            color: done ? t.textFaint : t.text,
            textDecoration: done ? "line-through" : "none",
          }}
          className="truncate text-sm"
        >
          {task.title}
        </div>
        {task.note ? (
          <div style={{ color: t.textFaint }} className="truncate text-xs">
            {task.note}
          </div>
        ) : null}
      </div>
      {task.priority === "high" ? (
        <Flag style={{ color: t.overdue }} className="size-3.5 shrink-0" fill="currentColor" />
      ) : null}
      <span style={{ color: t.textMuted }} className="flex shrink-0 items-center gap-1.5 text-xs">
        <span style={{ background: t.dots[task.list] }} className="size-2 rounded-full" />
        {task.list}
      </span>
      <span
        style={{ color: stateColor[task.state] }}
        className="shrink-0 text-xs font-medium tabular-nums"
      >
        {task.due}
      </span>
    </div>
  )
}
