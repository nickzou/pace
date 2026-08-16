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

// Dev-only. The Aurora aesthetic in LIGHT mode, locked to the Sidebar layout, with a
// swappable primary accent. Same glassy chrome + blue→indigo brand as /concept-aurora,
// but inverted: a lavender-white background, translucent white surfaces, dark indigo
// text, and a softer colored underglow.
export const Route = createFileRoute("/concept-aurora-light")({
  beforeLoad: () => {
    if (import.meta.env.PROD) throw notFound()
  },
  component: AuroraLight,
})

// Fixed light shell — everything that is NOT the accent.
const shell = {
  bg: "#f4f5fb",
  panel: "rgba(255,255,255,0.55)",
  card: "#ffffff",
  border: "rgba(30,27,75,0.10)",
  borderStrong: "rgba(30,27,75,0.22)",
  text: "#211f38",
  textMuted: "#615d80",
  textFaint: "#9995b3",
  overdue: "#dc2626",
  today: "#d97706",
  personalDot: "#059669",
  radius: 16,
  font: "'Inter', system-ui, sans-serif",
}

type Accent = { key: string; name: string; from: string; to: string }

const ACCENTS: Accent[] = [
  { key: "indigo", name: "Blue → Indigo", from: "#60a5fa", to: "#6366f1" },
  { key: "violet", name: "Violet → Pink", from: "#a855f7", to: "#ec4899" },
  { key: "cyan", name: "Cyan → Blue", from: "#22d3ee", to: "#3b82f6" },
  { key: "emerald", name: "Emerald → Teal", from: "#34d399", to: "#14b8a6" },
  { key: "amber", name: "Amber → Orange", from: "#fbbf24", to: "#f97316" },
  { key: "rose", name: "Rose → Red", from: "#fb7185", to: "#f43f5e" },
]

function hexToRgb(hex: string) {
  const h = hex.replace("#", "")
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  }
}
function rgba(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}
// Pick black-ish or white text for legibility on a given accent fill.
function readableText(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#211f38" : "#ffffff"
}

function AuroraLight() {
  const [accentKey, setAccentKey] = useState(ACCENTS[0]?.key ?? "indigo")
  const [done, setDone] = useState<Set<string>>(new Set(["3"]))
  const a = ACCENTS.find((x) => x.key === accentKey) ?? ACCENTS[0]
  if (!a) return null

  const gradient = `linear-gradient(135deg,${a.from},${a.to})`
  const soft = rgba(a.from, 0.14)
  const onAccent = readableText(a.from)
  const glow = `0 1px 2px rgba(30,27,75,0.06), 0 12px 30px ${rgba(a.from, 0.18)}`

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const t = { ...shell, accent: a.from, gradient, soft, onAccent, glow }

  return (
    <div style={{ background: t.bg, color: t.text, fontFamily: t.font }} className="flex h-screen">
      {/* Sidebar */}
      <aside
        style={{ background: t.panel, borderColor: t.border }}
        className="flex w-60 shrink-0 flex-col gap-6 border-r p-4 backdrop-blur"
      >
        <div
          style={{
            background: t.gradient,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
          className="px-2 text-2xl font-bold tracking-tight"
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
          <div
            style={{ color: t.textFaint }}
            className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider"
          >
            Lists
          </div>
          <Nav t={t} icon={<Inbox />} name="Inbox" count={0} />
          <Nav t={t} icon={<Hash style={{ color: t.accent }} />} name="Work" count={3} />
          <Nav t={t} icon={<Hash style={{ color: t.personalDot }} />} name="Personal" count={3} />
        </div>

        <button
          type="button"
          style={{ color: t.textMuted }}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm"
        >
          <span
            style={{ background: t.gradient, color: t.onAccent, borderRadius: t.radius }}
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
            <h1 className="text-2xl font-bold tracking-tight">Today</h1>
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
                borderColor: t.border,
                borderRadius: t.radius,
                color: t.text,
              }}
              className="w-56 border py-2 pl-9 pr-3 text-sm outline-none"
            />
          </div>
          <button
            type="button"
            style={{
              background: t.gradient,
              color: t.onAccent,
              borderRadius: t.radius,
              boxShadow: t.glow,
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
                      style={{ color: g.key === "overdue" ? t.overdue : t.text }}
                      className="text-sm font-semibold"
                    >
                      {g.label}
                    </h2>
                    <span
                      style={{ background: t.soft, color: t.textMuted, borderRadius: 999 }}
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
                      boxShadow: t.glow,
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

      {/* Accent picker (top-right, floating) */}
      <div
        style={{ background: t.panel, borderColor: t.border, boxShadow: t.glow }}
        className="fixed right-4 top-4 z-50 flex flex-col gap-1 rounded-2xl border p-2 backdrop-blur"
      >
        <div
          style={{ color: t.textFaint }}
          className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider"
        >
          Accent
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {ACCENTS.map((ac) => {
            const on = ac.key === accentKey
            return (
              <button
                type="button"
                key={ac.key}
                onClick={() => setAccentKey(ac.key)}
                title={ac.name}
                style={{
                  background: `linear-gradient(135deg,${ac.from},${ac.to})`,
                  boxShadow: on ? `0 0 0 2px ${t.card}, 0 0 0 4px ${ac.from}` : "none",
                }}
                className="size-8 rounded-xl transition-transform hover:scale-105"
              />
            )
          })}
        </div>
        <div style={{ color: t.textMuted }} className="px-1 pt-1 text-center text-[11px]">
          {a.name}
        </div>
      </div>
      <ConceptSwitcher current="/concept-aurora-light" />
    </div>
  )
}

type ThemeCtx = typeof shell & {
  accent: string
  gradient: string
  soft: string
  onAccent: string
  glow: string
}

function Nav({
  t,
  icon,
  name,
  count,
  active,
  danger,
}: {
  t: ThemeCtx
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
        background: active ? t.soft : "transparent",
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
  t: ThemeCtx
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
          background: done ? t.gradient : "transparent",
          borderColor: done ? "transparent" : t.borderStrong,
          color: t.onAccent,
          borderRadius: 999,
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
        <span
          style={{
            background:
              task.list === "Work"
                ? t.accent
                : task.list === "Personal"
                  ? t.personalDot
                  : t.textFaint,
          }}
          className="size-2 rounded-full"
        />
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
