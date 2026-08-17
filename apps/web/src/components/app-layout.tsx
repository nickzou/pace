import { useQuery } from "@powersync/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { AlertTriangle, CalendarDays, ListTodo, LogOut, Menu, Sun } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { signOut, useSession } from "#/lib/auth-client"
import { RequireLocalDb } from "#/lib/powersync/require-db"
import { dueDayState } from "#/lib/tasks/dates"
import { cn } from "#/lib/utils"

// The app shell: sidebar (brand · smart-view nav with live counts · user footer)
// plus the <main> frame. Shared by every signed-in surface — the task list and the
// task detail page render their own header + content into {children}. The active
// view lives in the URL (?view=…) so the nav works from any route and is
// deep-linkable; see the "/" route's validateSearch.
//
// Responsive: on md+ the sidebar is a fixed left rail; below that it collapses to a
// slide-up bottom sheet opened by a small floating trigger, so the phone view gets
// the full width. Both render the same SidebarNav.
export type View = "all" | "today" | "upcoming" | "overdue"

export const VIEWS: { key: View; label: string; icon: ReactNode }[] = [
  { key: "today", label: "Today", icon: <Sun /> },
  { key: "upcoming", label: "Upcoming", icon: <CalendarDays /> },
  { key: "overdue", label: "Overdue", icon: <AlertTriangle /> },
  { key: "all", label: "All tasks", icon: <ListTodo /> },
]

type CountRow = { due_date: string | null; category: string }

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <RequireLocalDb>
        <Shell>{children}</Shell>
      </RequireLocalDb>
    </div>
  )
}

// Rendered only once RequireLocalDb has a session + the local DB, so the count
// query is safe here.
function Shell({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const { data: rows } = useQuery<CountRow>(
    "SELECT t.due_date, s.category FROM tasks t JOIN statuses s ON s.id = t.status_id",
  )
  const loc = useRouterState({ select: (s) => s.location })
  const activeView: View | undefined =
    loc.pathname === "/" ? ((loc.search as { view?: View }).view ?? "all") : undefined

  const [sheetOpen, setSheetOpen] = useState(false)

  // While the mobile sheet is open, lock body scroll and close on Escape.
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false)
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKey)
    }
  }, [sheetOpen])

  const count = (v: View) =>
    v === "all"
      ? rows.length
      : rows.filter((r) => dueDayState(r.due_date, r.category === "done") === v).length

  const email = session?.user.email ?? ""
  const initials = email.slice(0, 2).toUpperCase() || "··"
  const settingsActive = loc.pathname === "/settings"
  const nav = { count, activeView, email, initials, settingsActive }

  return (
    <div className="flex h-screen">
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-border bg-card/40 p-4 md:flex">
        <SidebarNav {...nav} />
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>

      {/* Mobile: unobtrusive trigger + slide-up sheet */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-label="Open menu"
        className="fixed bottom-4 left-4 z-30 flex size-10 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-glow backdrop-blur transition-colors hover:text-foreground md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <div
        aria-hidden="true"
        onClick={() => setSheetOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden",
          sheetOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-6 overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-6 shadow-glow transition-transform duration-300 ease-out md:hidden",
          sheetOpen ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
      >
        <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-input" />
        <SidebarNav {...nav} onNavigate={() => setSheetOpen(false)} />
      </div>
    </div>
  )
}

// The sidebar's contents, shared by the desktop rail and the mobile sheet. onNavigate
// (sheet only) closes the sheet after a tap.
function SidebarNav({
  count,
  activeView,
  email,
  initials,
  settingsActive,
  onNavigate,
}: {
  count: (v: View) => number
  activeView: View | undefined
  email: string
  initials: string
  settingsActive: boolean
  onNavigate?: () => void
}) {
  return (
    <>
      <Link
        to="/"
        onClick={onNavigate}
        className="bg-gradient-to-r from-brand-from to-brand-to bg-clip-text px-2 text-2xl font-bold tracking-tight text-transparent"
      >
        Pace
      </Link>

      <nav className="flex flex-col gap-0.5">
        {VIEWS.map((v) => {
          const n = count(v.key)
          const active = v.key === activeView
          return (
            <Link
              key={v.key}
              to="/"
              search={{ view: v.key }}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {v.icon}
              <span className="min-w-0 flex-1 truncate">{v.label}</span>
              {n > 0 ? (
                <span
                  className={cn(
                    "text-xs",
                    v.key === "overdue" ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {n}
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex items-center gap-1 text-sm">
        <Link
          to="/settings"
          onClick={onNavigate}
          title="Settings"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 transition-colors",
            settingsActive
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </span>
          <span className="min-w-0 flex-1 truncate">{email || "Account"}</span>
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </>
  )
}
