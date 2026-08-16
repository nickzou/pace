import { createFileRoute, notFound } from "@tanstack/react-router"
import { Check, Plus } from "lucide-react"
import { useState } from "react"
import { ConceptSwitcher, dueText, GROUPS, listDot, TASKS } from "#/components/concept-kit"
import { cn } from "#/lib/utils"

// Concept 2 — a dense, keyboard-driven list à la Linear/Superhuman. Minimal chrome,
// tight rows, round checks, everything scannable in one column.
export const Route = createFileRoute("/concept-compact")({
  beforeLoad: () => {
    if (import.meta.env.PROD) throw notFound()
  },
  component: Compact,
})

const FILTERS = ["All", "Overdue", "Today", "Upcoming"] as const

function Compact() {
  const [done, setDone] = useState<Set<string>>(new Set(["3"]))
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All")
  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <header className="mb-6 flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
          <div className="ml-2 flex gap-1">
            {FILTERS.map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  filter === f
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              C
            </kbd>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </header>

        {GROUPS.filter((g) => filter === "All" || g.label === filter).map((g) => {
          const tasks = TASKS.filter((t) => t.state === g.key)
          return (
            <section key={g.key} className="mb-6">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {g.label}
                <span className="text-muted-foreground/60">{tasks.length}</span>
              </div>
              <ul>
                {tasks.map((t) => {
                  const isDone = done.has(t.id)
                  return (
                    <li
                      key={t.id}
                      className="group flex items-center gap-3 border-border/60 border-b py-2 last:border-0"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(t.id)}
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                          isDone
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/60 text-transparent hover:border-foreground",
                        )}
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </button>
                      {t.priority ? (
                        <span
                          className={cn("size-1.5 shrink-0 rounded-full", {
                            "bg-destructive": t.priority === "high",
                            "bg-warning": t.priority === "med",
                            "bg-muted-foreground": t.priority === "low",
                          })}
                        />
                      ) : (
                        <span className="size-1.5 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          isDone && "text-muted-foreground line-through",
                        )}
                      >
                        {t.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                        <span className={cn("size-1.5 rounded-full", listDot[t.list])} />
                        {t.list}
                      </span>
                      <span className={cn("shrink-0 text-xs tabular-nums", dueText[t.state])}>
                        {t.due}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      <ConceptSwitcher current="/concept-compact" />
    </div>
  )
}
