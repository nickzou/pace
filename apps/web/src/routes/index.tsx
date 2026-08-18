import { usePowerSync, useQuery } from "@powersync/react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, Search, Trash2 } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"
import { AppLayout, VIEWS } from "#/components/app-layout"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { TagChips, type TagOption, TagPicker } from "#/lib/tags/tag-control"
import { dueDayState, formatDate } from "#/lib/tasks/dates"
import { type Filters, matchesFilters } from "#/lib/tasks/filter"
import { FilterBar } from "#/lib/tasks/filter-bar"
import { deleteWithUndo, setTaskStatus, type Task } from "#/lib/tasks/mutations"
import { StatusControl, type StatusOption } from "#/lib/tasks/status-control"
import { TaskModal } from "#/lib/tasks/task-modal"
import { useToast } from "#/lib/toast"
import { cn } from "#/lib/utils"

// A single querystring value can arrive as a string, an array, or absent. Coerce to a
// non-empty string[] (or undefined) for the array facets.
function toStrArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const a = v.map(String).filter(Boolean)
    return a.length ? a : undefined
  }
  if (typeof v === "string" && v) return [v]
  return undefined
}

// The whole filter state lives in the URL (view/status/tags/tagsMode/notTags) so it's
// deep-linkable, shareable, and survives reload. Absent view ⇒ "all".
export const Route = createFileRoute("/")({
  validateSearch: (search): Filters => {
    const v = search.view
    return {
      view: v === "today" || v === "upcoming" || v === "overdue" || v === "all" ? v : undefined,
      status: toStrArray(search.status),
      tags: toStrArray(search.tags),
      tagsMode: search.tagsMode === "all" ? "all" : undefined,
      notTags: toStrArray(search.notTags),
    }
  },
  component: Home,
})

// A task joined with its status (P2-03) — the category drives done-ness, the colour +
// name drive the status control.
type ListTask = Task & {
  status_name: string
  status_color: string
  status_category: string
  status_group_id: string
}

const TASKS_SQL = `
  SELECT t.id, t.title, t.description, t.status_id, t.resolved_at,
         t.start_date, t.due_date, t.start_has_time, t.due_has_time,
         t.created_at, t.updated_at,
         s.name AS status_name, s.color AS status_color,
         s.category AS status_category, s.group_id AS status_group_id
  FROM tasks t JOIN statuses s ON s.id = t.status_id
  ORDER BY t.created_at DESC`

const STATUSES_SQL = "SELECT id, group_id, name, color, category FROM statuses ORDER BY position"

const TAGS_SQL = "SELECT id, name, color FROM tags ORDER BY position, created_at"

// Every task→tag link, joined to the tag's display fields — grouped into a per-task map.
const TAG_LINKS_SQL =
  "SELECT tt.task_id, tg.id, tg.name, tg.color FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id"

// A new task gets the default group's first open status (its "To Do").
const DEFAULT_STATUS_SQL = `
  SELECT s.id FROM statuses s JOIN status_groups g ON g.id = s.group_id
  WHERE g.is_default = 1 AND s.category = 'open' ORDER BY s.position LIMIT 1`

function Home() {
  return (
    <AppLayout>
      <TaskListView />
    </AppLayout>
  )
}

// The task list surface. Rendered inside AppLayout's PowerSync provider, so the
// query/mutations are safe. The view filter comes from the URL; text search is local.
function TaskListView() {
  const db = usePowerSync()
  const toast = useToast()
  const { data: tasks, isLoading } = useQuery<ListTask>(TASKS_SQL)
  const { data: allStatuses } = useQuery<StatusOption & { group_id: string }>(STATUSES_SQL)
  const { data: allTags } = useQuery<TagOption>(TAGS_SQL)
  const { data: links } = useQuery<TagOption & { task_id: string }>(TAG_LINKS_SQL)
  const { data: defaults } = useQuery<{ id: string }>(DEFAULT_STATUS_SQL)
  const defaultStatusId = defaults[0]?.id
  const filters = Route.useSearch()
  const navigate = Route.useNavigate()

  const [search, setSearch] = useState("")
  const [title, setTitle] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Statuses grouped by their group, so each row's control lists only its group's options.
  const statusesByGroup = useMemo(() => {
    const map = new Map<string, StatusOption[]>()
    for (const s of allStatuses) {
      const arr = map.get(s.group_id) ?? []
      arr.push({ id: s.id, name: s.name, color: s.color, category: s.category })
      map.set(s.group_id, arr)
    }
    return map
  }, [allStatuses])

  // Each task's tags, in one map, so filtering + row rendering share the same source.
  const tagsByTask = useMemo(() => {
    const map = new Map<string, TagOption[]>()
    for (const l of links) {
      const arr = map.get(l.task_id) ?? []
      arr.push({ id: l.id, name: l.name, color: l.color })
      map.set(l.task_id, arr)
    }
    return map
  }, [links])

  const q = search.trim().toLowerCase()
  const visible = tasks
    .filter((t) => matchesFilters(t, tagsByTask.get(t.id) ?? [], filters))
    .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))

  const currentLabel = VIEWS.find((v) => v.key === filters.view)?.label ?? "All tasks"
  const setFilters = (patch: Partial<Filters>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) })
  const clearFilters = () => navigate({ search: (prev) => ({ view: prev.view }) })

  async function add(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !defaultStatusId) return
    const now = new Date().toISOString()
    await db.execute(
      "INSERT INTO tasks (id, title, description, status_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), trimmed, "", defaultStatusId, now, now],
    )
    setTitle("")
  }

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border px-8 py-5">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{currentLabel}</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${visible.length} ${visible.length === 1 ? "task" : "tasks"}`}
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-56 pl-9"
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <form onSubmit={add} className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task…"
              className="flex-1"
            />
            <Button type="submit" disabled={!title.trim() || !defaultStatusId}>
              <Plus /> Add
            </Button>
          </form>

          <FilterBar
            filters={filters}
            allTags={allTags}
            allStatuses={allStatuses}
            onChange={setFilters}
            onClear={clearFilters}
          />

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {search.trim()
                ? "No tasks match your search."
                : filters.view && filters.view !== "all"
                  ? `Nothing ${currentLabel.toLowerCase()}.`
                  : "No tasks match these filters."}
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-glow">
              {visible.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  first={i === 0}
                  options={statusesByGroup.get(task.status_group_id) ?? []}
                  tags={tagsByTask.get(task.id) ?? []}
                  allTags={allTags}
                  onSelectStatus={(sid) => void setTaskStatus(db, task.id, sid)}
                  onOpen={() => setSelectedId(task.id)}
                  onDelete={() => void deleteWithUndo(db, task, toast)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <TaskModal id={selectedId} onClose={() => setSelectedId(null)} />
    </>
  )
}

function TaskRow({
  task,
  first,
  options,
  tags,
  allTags,
  onSelectStatus,
  onOpen,
  onDelete,
}: {
  task: ListTask
  first: boolean
  options: StatusOption[]
  tags: TagOption[]
  allTags: TagOption[]
  onSelectStatus: (statusId: string) => void
  onOpen: () => void
  onDelete: () => void
}) {
  const resolved = task.status_category === "done"
  const dueState = dueDayState(task.due_date, resolved)
  const assignedIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags])
  return (
    <li
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
        !first && "border-t border-border",
      )}
    >
      <StatusControl
        current={{
          id: task.status_id,
          name: task.status_name,
          color: task.status_color,
          category: task.status_category,
        }}
        options={options}
        onSelect={onSelectStatus}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span
          className={cn("block truncate text-sm", resolved && "text-muted-foreground line-through")}
        >
          {task.title}
        </span>
        {task.description ? (
          <span className="block truncate text-xs text-muted-foreground">{task.description}</span>
        ) : null}
        {task.due_date ? (
          <span
            className={cn(
              "block text-xs",
              dueState === "overdue"
                ? "text-destructive"
                : dueState === "today"
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            {dueState === "overdue" ? "Overdue · " : "Due "}
            {formatDate(task.due_date, !!task.due_has_time)}
          </span>
        ) : null}
        {tags.length > 0 ? (
          <span className="mt-1.5 block">
            <TagChips tags={tags} max={4} />
          </span>
        ) : null}
      </button>
      <TagPicker
        taskId={task.id}
        assignedIds={assignedIds}
        allTags={allTags}
        nextPosition={allTags.length}
      />
      {/* Always faintly visible so it's tappable on touch/no-hover browsers; brightens on
          row hover or keyboard focus, so pointer devices still get the tidy reveal feel. */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete task"
        className="shrink-0 text-muted-foreground opacity-50 transition-all hover:text-destructive hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 [&_svg]:size-4"
      >
        <Trash2 />
      </button>
    </li>
  )
}
