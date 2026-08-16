import { createFileRoute, notFound } from "@tanstack/react-router"
import { Bell, Calendar, Check, Flag, Hash, Plus, Repeat, Trash2 } from "lucide-react"
import { useState } from "react"
import {
  ConceptSwitcher,
  type ConceptTask,
  dueText,
  GROUPS,
  listDot,
  TASKS,
} from "#/components/concept-kit"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

// Concept 4 — a two-pane master/detail, à la Things/Outlook. Scannable list on the
// left, a rich editor on the right for the selected task.
export const Route = createFileRoute("/concept-split")({
  beforeLoad: () => {
    if (import.meta.env.PROD) throw notFound()
  },
  component: Split,
})

function Split() {
  const [selectedId, setSelectedId] = useState("1")
  const [done, setDone] = useState<Set<string>>(new Set(["3"]))
  const selected = TASKS.find((t) => t.id === selectedId) ?? TASKS[0]
  if (!selected) return null
  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      {/* Master list */}
      <div className="flex w-96 shrink-0 flex-col border-r border-border">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <h1 className="text-lg font-semibold tracking-tight">Today</h1>
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {TASKS.length}
          </span>
          <button
            type="button"
            className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {GROUPS.map((g) => {
            const tasks = TASKS.filter((t) => t.state === g.key)
            return (
              <div key={g.key}>
                <div className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </div>
                {tasks.map((t) => (
                  <MasterRow
                    key={t.id}
                    task={t}
                    active={t.id === selectedId}
                    done={done.has(t.id)}
                    onSelect={() => setSelectedId(t.id)}
                    onToggle={() => toggle(t.id)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail */}
      <Detail task={selected} done={done.has(selected.id)} onToggle={() => toggle(selected.id)} />
      <ConceptSwitcher current="/concept-split" />
    </div>
  )
}

function MasterRow({
  task,
  active,
  done,
  onSelect,
  onToggle,
}: {
  task: ConceptTask
  active: boolean
  done: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 border-l-2 px-5 py-2.5 text-left transition-colors",
        active ? "border-primary bg-accent/60" : "border-transparent hover:bg-accent/30",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/60 text-transparent hover:border-foreground",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </button>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {task.title}
      </span>
      {task.priority === "high" ? (
        <Flag className="size-3 shrink-0 text-destructive" fill="currentColor" />
      ) : null}
      <span className={cn("shrink-0 text-xs tabular-nums", dueText[task.state])}>{task.due}</span>
    </button>
  )
}

function Detail({
  task,
  done,
  onToggle,
}: {
  task: ConceptTask
  done: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-10 py-8">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              done
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/60 text-transparent hover:border-foreground",
            )}
          >
            <Check className="size-4" strokeWidth={3} />
          </button>
          <h1
            className={cn(
              "flex-1 text-2xl font-bold tracking-tight",
              done && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </h1>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {task.note ??
            "No description yet. Click to add notes, links, or a checklist for this task."}
        </p>

        <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          <MetaRow icon={<Calendar />} label="Due">
            <span className={cn("font-medium", dueText[task.state])}>{task.due}</span>
          </MetaRow>
          <MetaRow icon={<Hash />} label="List">
            <span className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", listDot[task.list])} />
              {task.list}
            </span>
          </MetaRow>
          <MetaRow icon={<Flag />} label="Priority">
            <span className="capitalize">{task.priority ?? "None"}</span>
          </MetaRow>
          <MetaRow icon={<Bell />} label="Reminder">
            <span className="text-muted-foreground">None</span>
          </MetaRow>
          <MetaRow icon={<Repeat />} label="Repeat">
            <span className="text-muted-foreground">Never</span>
          </MetaRow>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Plus /> Subtask
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground hover:text-destructive"
          >
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto">{children}</span>
    </div>
  )
}
