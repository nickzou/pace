import { usePowerSync, useQuery } from "@powersync/react"
import { createFileRoute } from "@tanstack/react-router"
import { Plus, Search, Trash2 } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"
import { AppLayout, VIEWS } from "#/components/app-layout"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { TagChips, type TagOption, TagPicker } from "#/lib/tags/tag-control"
import { dueDayState, formatDate } from "#/lib/tasks/dates"
import { type Filters, hasActiveFilters, matchesFilters } from "#/lib/tasks/filter"
import { FilterBar } from "#/lib/tasks/filter-bar"
import { createTask, deleteWithUndo, setTaskStatus, type Task } from "#/lib/tasks/mutations"
import { setTaskOrder } from "#/lib/tasks/order"
import { DragHandle, type RowSortable, TaskSortList, useRowSortable } from "#/lib/tasks/order-dnd"
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
  // Subtask roll-up (P2-05): counts of this task's direct children, for the progress badge.
  child_count: number
  done_count: number
}

const TASKS_SQL = `
  SELECT t.id, t.title, t.description, t.status_id, t.resolved_at,
         t.start_date, t.due_date, t.start_has_time, t.due_has_time, t.parent_id,
         t.sort_order, t.created_at, t.updated_at,
         s.name AS status_name, s.color AS status_color,
         s.category AS status_category, s.group_id AS status_group_id,
         (SELECT count(*) FROM tasks c WHERE c.parent_id = t.id) AS child_count,
         (SELECT count(*) FROM tasks c JOIN statuses cs ON cs.id = c.status_id
            WHERE c.parent_id = t.id AND cs.category = 'done') AS done_count
  FROM tasks t JOIN statuses s ON s.id = t.status_id
  ORDER BY t.sort_order, t.id`

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

  // Task id → title, so a surfaced subtask can show where it lives.
  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks])

  const q = search.trim().toLowerCase()
  // Unfiltered, the list shows only top-level tasks — subtasks live inside their parent. As
  // soon as any facet or search is active it flattens to every matching task at any depth,
  // each with a parent breadcrumb, so a due subtask still surfaces in a date view.
  const flat = hasActiveFilters(filters) || q.length > 0
  const matched = tasks
    .filter((t) => matchesFilters(t, tagsByTask.get(t.id) ?? [], filters))
    .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
    .filter((t) => flat || t.parent_id == null)

  // A date smart-view reads as an agenda: sort by due date first, manual order (the sort_order
  // the base query already applied) as the stable tiebreak. Array.sort is stable, and date-only
  // tasks store end-of-day, so within a day timed tasks lead and untimed ones follow in manual
  // order. Every other view keeps pure manual order.
  const isDateView =
    filters.view === "today" || filters.view === "upcoming" || filters.view === "overdue"
  const visible = isDateView
    ? [...matched].sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    : matched

  // Dragging lives only in the unfiltered top-level list. In a filtered/date/search view the
  // rows are a subset (or date-ordered), so "drop between hidden rows" has no defined target.
  const draggable = !flat

  const currentLabel = VIEWS.find((v) => v.key === filters.view)?.label ?? "All tasks"
  const setFilters = (patch: Partial<Filters>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) })
  const clearFilters = () => navigate({ search: (prev) => ({ view: prev.view }) })

  async function add(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !defaultStatusId) return
    // createTask mints a bottom-of-scope sort key, so a new task lands at the end of the list.
    await createTask(db, { title: trimmed, statusId: defaultStatusId })
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
            (() => {
              const rows = visible.map((task, i) => {
                const rowProps = {
                  task,
                  first: i === 0,
                  options: statusesByGroup.get(task.status_group_id) ?? [],
                  tags: tagsByTask.get(task.id) ?? [],
                  allTags,
                  parentTitle: task.parent_id ? titleById.get(task.parent_id) : undefined,
                  onSelectStatus: (sid: string) => void setTaskStatus(db, task.id, sid),
                  onOpen: () => setSelectedId(task.id),
                  onDelete: () => void deleteWithUndo(db, task, toast),
                }
                return draggable ? (
                  <SortableTaskRow key={task.id} {...rowProps} />
                ) : (
                  <TaskRow key={task.id} {...rowProps} />
                )
              })
              const list = (
                <ul className="overflow-hidden rounded-xl border border-border bg-card shadow-glow">
                  {rows}
                </ul>
              )
              return draggable ? (
                <TaskSortList items={visible} onMove={(id, key) => void setTaskOrder(db, id, key)}>
                  {list}
                </TaskSortList>
              ) : (
                list
              )
            })()
          )}
        </div>
      </div>

      <TaskModal id={selectedId} onClose={() => setSelectedId(null)} />
    </>
  )
}

type TaskRowProps = {
  task: ListTask
  first: boolean
  options: StatusOption[]
  tags: TagOption[]
  allTags: TagOption[]
  parentTitle?: string
  onSelectStatus: (statusId: string) => void
  onOpen: () => void
  onDelete: () => void
}

// The draggable variant: calls useSortable (needs a SortableContext ancestor, provided by
// TaskSortList) and threads the drag state into TaskRow. Rendered only in the unfiltered list.
function SortableTaskRow(props: TaskRowProps) {
  const sortable = useRowSortable(props.task.id)
  return <TaskRow {...props} sortable={sortable} />
}

function TaskRow({
  task,
  first,
  options,
  tags,
  allTags,
  parentTitle,
  onSelectStatus,
  onOpen,
  onDelete,
  sortable,
}: TaskRowProps & { sortable?: RowSortable }) {
  const resolved = task.status_category === "done"
  const dueState = dueDayState(task.due_date, resolved)
  const assignedIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags])
  return (
    <li
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
        !first && "border-t border-border",
        sortable?.isDragging && "relative z-10 bg-card opacity-80 shadow-lg",
      )}
    >
      {sortable ? <DragHandle handleProps={sortable.handleProps} /> : null}
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
      {/* Title/notes/due open the task; the tag chips sit outside the button so each chip
          can open its own edit popover (a button can't nest a button). */}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpen} className="block w-full text-left">
          {parentTitle ? (
            <span className="block truncate text-[11px] text-muted-foreground">
              ↳ in {parentTitle}
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 truncate text-sm",
                resolved && "text-muted-foreground line-through",
              )}
            >
              {task.title}
            </span>
            {task.child_count > 0 ? (
              <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {task.done_count}/{task.child_count}
              </span>
            ) : null}
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
        </button>
        {tags.length > 0 ? (
          <div className="mt-1.5">
            <TagChips tags={tags} taskId={task.id} max={4} />
          </div>
        ) : null}
      </div>
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
