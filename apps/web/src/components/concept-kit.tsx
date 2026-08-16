import { Link } from "@tanstack/react-router"
import { cn } from "#/lib/utils"

// Shared bits for the dev-only design concepts (/concepts, /concept-*): sample data,
// badge/colour helpers, and a floating switcher to compare the directions.
export type State = "overdue" | "today" | "upcoming"
export type Priority = "high" | "med" | "low"
export type ConceptTask = {
  id: string
  title: string
  note?: string
  list: "Work" | "Personal" | "Inbox"
  due: string
  state: State
  priority?: Priority
  done?: boolean
}

export const TASKS: ConceptTask[] = [
  {
    id: "1",
    title: "Pay rent",
    note: "Transfer to landlord",
    list: "Personal",
    due: "Due Jan 2",
    state: "overdue",
    priority: "high",
  },
  {
    id: "2",
    title: "Reply to design feedback",
    list: "Work",
    due: "Yesterday",
    state: "overdue",
    priority: "med",
  },
  {
    id: "3",
    title: "Team standup",
    note: "Daily sync",
    list: "Work",
    due: "9:00 AM",
    state: "today",
    done: true,
  },
  {
    id: "4",
    title: "Grocery run",
    note: "Milk, eggs, coffee",
    list: "Personal",
    due: "Today",
    state: "today",
    priority: "low",
  },
  {
    id: "5",
    title: "Review PR #128",
    list: "Work",
    due: "5:00 PM",
    state: "today",
    priority: "med",
  },
  {
    id: "6",
    title: "Draft Q3 roadmap",
    note: "Outline themes + milestones",
    list: "Work",
    due: "Tomorrow",
    state: "upcoming",
    priority: "high",
  },
  { id: "7", title: "Book dentist", list: "Personal", due: "Fri, Aug 22", state: "upcoming" },
  {
    id: "8",
    title: "Renew domain",
    list: "Inbox",
    due: "Aug 25",
    state: "upcoming",
    priority: "low",
  },
  {
    id: "9",
    title: "Plan weekend trip",
    note: "Check cabin availability",
    list: "Personal",
    due: "Aug 28",
    state: "upcoming",
  },
]

export const listDot: Record<ConceptTask["list"], string> = {
  Work: "bg-primary",
  Personal: "bg-success",
  Inbox: "bg-muted-foreground",
}

export const dueBadge: Record<State, string> = {
  overdue: "bg-destructive/15 text-destructive",
  today: "bg-warning/15 text-warning",
  upcoming: "bg-muted text-muted-foreground",
}

export const dueText: Record<State, string> = {
  overdue: "text-destructive",
  today: "text-warning",
  upcoming: "text-muted-foreground",
}

export const GROUPS: { key: State; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
]

export function ConceptSwitcher({ current }: { current: string }) {
  const items = [
    { to: "/concepts", label: "Sidebar" },
    { to: "/concept-compact", label: "Compact" },
    { to: "/concept-board", label: "Board" },
    { to: "/concept-split", label: "Split" },
    { to: "/concept-styles", label: "Styles" },
    { to: "/concept-aurora", label: "Aurora" },
    { to: "/concept-aurora-light", label: "Aurora Light" },
  ] as const
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full border border-border bg-card/90 p-1 shadow-lg backdrop-blur">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className={cn(
            "rounded-full px-3 py-1 text-xs transition-colors",
            current === it.to
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {it.label}
        </Link>
      ))}
    </div>
  )
}
