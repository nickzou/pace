import { createFileRoute, notFound } from "@tanstack/react-router"
import {
  AlertTriangle,
  CalendarDays,
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
import { ConceptSwitcher } from "#/components/concept-kit"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import { Input } from "#/components/ui/input"
import { cn } from "#/lib/utils"

// A dev-only design CONCEPT for a fleshed-out Pace — an app shell (sidebar + grouped
// task list) built entirely on @pace/tokens + the shadcn components, so it's a real
// exercise of the design system, not just a mock. Static sample data; not wired to
// PowerSync. Not reachable in any production build.
export const Route = createFileRoute("/concepts")({
  beforeLoad: () => {
    if (import.meta.env.PROD) throw notFound()
  },
  component: Concepts,
})

type State = "overdue" | "today" | "upcoming"
type Task = {
  id: string
  title: string
  note?: string
  list: "Work" | "Personal"
  due: string
  state: State
  priority?: boolean
  done?: boolean
}

const TASKS: Task[] = [
  {
    id: "1",
    title: "Pay rent",
    note: "Transfer to landlord",
    list: "Personal",
    due: "Due Jan 2",
    state: "overdue",
    priority: true,
  },
  { id: "2", title: "Reply to design feedback", list: "Work", due: "Yesterday", state: "overdue" },
  {
    id: "3",
    title: "Team standup",
    note: "Daily sync",
    list: "Work",
    due: "9:00 AM",
    state: "today",
    done: true,
  },
  { id: "4", title: "Grocery run", list: "Personal", due: "Today", state: "today" },
  {
    id: "5",
    title: "Draft Q3 roadmap",
    list: "Work",
    due: "Tomorrow",
    state: "upcoming",
    priority: true,
  },
  { id: "6", title: "Book dentist", list: "Personal", due: "Fri, Aug 22", state: "upcoming" },
]

const listDot: Record<Task["list"], string> = { Work: "bg-primary", Personal: "bg-success" }

const dueBadge: Record<State, string> = {
  overdue: "bg-destructive/15 text-destructive",
  today: "bg-warning/15 text-warning",
  upcoming: "bg-muted text-muted-foreground",
}

function Concepts() {
  const [done, setDone] = useState<Set<string>>(new Set(["3"]))
  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const groups: { key: State; label: string; accent?: string }[] = [
    { key: "overdue", label: "Overdue", accent: "text-destructive" },
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
  ]

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col gap-6 border-r border-border bg-card/40 p-4">
        <div className="bg-gradient-to-r from-brand-from to-brand-to bg-clip-text px-2 text-2xl font-bold tracking-tight text-transparent">
          Pace
        </div>

        <nav className="flex flex-col gap-0.5">
          <NavItem icon={<Sun />} label="Today" count={2} active />
          <NavItem icon={<CalendarDays />} label="Upcoming" count={2} />
          <NavItem icon={<AlertTriangle />} label="Overdue" count={2} danger />
          <NavItem icon={<ListTodo />} label="All tasks" count={6} />
        </nav>

        <div className="flex flex-col gap-0.5">
          <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Lists
          </div>
          <NavItem icon={<Inbox />} label="Inbox" count={0} />
          <NavItem icon={<Hash className="text-primary" />} label="Work" count={3} />
          <NavItem icon={<Hash className="text-success" />} label="Personal" count={3} />
        </div>

        <button
          type="button"
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            NZ
          </span>
          <span className="min-w-0 flex-1 truncate">Nick Zou</span>
          <Settings className="size-4 shrink-0" />
        </button>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-4 border-b border-border px-8 py-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Today</h1>
            <p className="text-sm text-muted-foreground">
              Thursday, August 14 · 2 overdue · 2 due today
            </p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search…" className="w-56 pl-9" />
          </div>
          <Button>
            <Plus /> Add task
          </Button>
        </header>

        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-8">
            {groups.map((g) => {
              const tasks = TASKS.filter((t) => t.state === g.key)
              return (
                <section key={g.key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-1">
                    <h2 className={cn("text-sm font-semibold", g.accent)}>{g.label}</h2>
                    <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                      {tasks.length}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    {tasks.map((t, i) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        done={done.has(t.id)}
                        onToggle={() => toggle(t.id)}
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
      <ConceptSwitcher current="/concepts" />
    </div>
  )
}

function NavItem({
  icon,
  label,
  count,
  active,
  danger,
}: {
  icon: ReactNode
  label: string
  count: number
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 ? (
        <span className={cn("text-xs", danger ? "text-destructive" : "text-muted-foreground")}>
          {count}
        </span>
      ) : null}
    </button>
  )
}

function TaskRow({
  task,
  done,
  onToggle,
  first,
}: {
  task: Task
  done: boolean
  onToggle: () => void
  first: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
        !first && "border-t border-border",
      )}
    >
      <Checkbox checked={done} onCheckedChange={onToggle} />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>
          {task.title}
        </div>
        {task.note ? (
          <div className="truncate text-xs text-muted-foreground">{task.note}</div>
        ) : null}
      </div>
      {task.priority ? <Flag className="size-3.5 shrink-0 text-warning" /> : null}
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("size-2 rounded-full", listDot[task.list])} />
        {task.list}
      </span>
      <span
        className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-medium", dueBadge[task.state])}
      >
        {task.due}
      </span>
    </div>
  )
}
