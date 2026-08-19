import { usePowerSync, useQuery } from "@powersync/react"
import { useMemo, useRef, useState } from "react"
import { TagChips, type TagOption, TagPicker } from "#/lib/tags/tag-control"
import {
  combineLocal,
  DUE_FALLBACK,
  dueDayState,
  START_FALLBACK,
  toDateInput,
  toTimeInput,
} from "#/lib/tasks/dates"
import { deleteWithUndo, setTaskStatus, type Task, updateTask } from "#/lib/tasks/mutations"
import { StatusControl, type StatusOption } from "#/lib/tasks/status-control"
import { openStatusForGroup } from "#/lib/tasks/status-group"
import { useToast } from "#/lib/toast"

// A task joined with its status (P2-03).
type DetailTask = Task & {
  status_name: string
  status_color: string
  status_category: string
  status_group_id: string
}

// The single-task view/editor shared by the quick modal and the dedicated
// /tasks/$taskId route. Reads the task live from local SQLite; title/notes edits
// save on blur; delete runs the Undo flow. The edit fields seed from the row only
// when the id first loads, so a background sync can't clobber in-progress typing.
export function TaskDetail({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const db = usePowerSync()
  const toast = useToast()
  const { data: rows, isLoading } = useQuery<DetailTask>(
    `SELECT t.id, t.title, t.description, t.status_id, t.resolved_at,
            t.start_date, t.due_date, t.start_has_time, t.due_has_time,
            t.created_at, t.updated_at,
            s.name AS status_name, s.color AS status_color,
            s.category AS status_category, s.group_id AS status_group_id
     FROM tasks t JOIN statuses s ON s.id = t.status_id WHERE t.id = ?`,
    [id],
  )
  const { data: allStatuses } = useQuery<StatusOption & { group_id: string }>(
    "SELECT id, group_id, name, color, category FROM statuses ORDER BY position",
  )
  const { data: groups } = useQuery<{ id: string; name: string }>(
    "SELECT id, name FROM status_groups ORDER BY position, created_at",
  )
  const { data: allTags } = useQuery<TagOption>(
    "SELECT id, name, color FROM tags ORDER BY position, created_at",
  )
  const { data: taskTags } = useQuery<TagOption>(
    "SELECT tg.id, tg.name, tg.color FROM task_tags tt JOIN tags tg ON tg.id = tt.tag_id WHERE tt.task_id = ?",
    [id],
  )
  const assignedIds = useMemo(() => new Set(taskTags.map((t) => t.id)), [taskTags])
  const task = rows[0]

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startDay, setStartDay] = useState("")
  const [startTime, setStartTime] = useState("")
  const [dueDay, setDueDay] = useState("")
  const [dueTime, setDueTime] = useState("")
  const seededFor = useRef<string | null>(null)

  // Seed the editable fields the first time a task loads — during render, NOT in an effect,
  // so there's never a committed frame where the task is present but the inputs are still
  // empty. A late (post-paint) effect seed would clobber a fast edit (or an e2e fill) made
  // in that window. Guarded by the ref, so it runs once per task and can't loop.
  if (task && seededFor.current !== task.id) {
    seededFor.current = task.id
    setTitle(task.title)
    setDescription(task.description)
    setStartDay(toDateInput(task.start_date))
    setStartTime(task.start_has_time ? toTimeInput(task.start_date) : "")
    setDueDay(toDateInput(task.due_date))
    setDueTime(task.due_has_time ? toTimeInput(task.due_date) : "")
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!task) return <p className="text-sm text-muted-foreground">This task no longer exists.</p>

  const saveTitle = () => {
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) void updateTask(db, id, { title: trimmed, description })
    else setTitle(task.title)
  }

  const saveDescription = () => {
    if (description !== task.description)
      void updateTask(db, id, { title: task.title, description })
  }

  // Dates save immediately on pick/clear. The date is required and the time is
  // optional (defaulted) — so picking just a day still saves a full timestamp.
  // If the local write throws — e.g. an out-of-date on-device schema missing the
  // column — surface it and revert, rather than showing a value that never saved.
  const saveStart = (day: string, time: string) => {
    setStartDay(day)
    setStartTime(time)
    const iso = combineLocal(day, time, START_FALLBACK)
    updateTask(db, id, { start_date: iso, start_has_time: iso && time ? 1 : 0 }).catch((err) => {
      console.error("Failed to save start date", err)
      toast.show("Couldn't save the start date — try reloading")
      setStartDay(toDateInput(task.start_date))
      setStartTime(task.start_has_time ? toTimeInput(task.start_date) : "")
    })
  }
  const saveDue = (day: string, time: string) => {
    setDueDay(day)
    setDueTime(time)
    const iso = combineLocal(day, time, DUE_FALLBACK)
    updateTask(db, id, { due_date: iso, due_has_time: iso && time ? 1 : 0 }).catch((err) => {
      console.error("Failed to save due date", err)
      toast.show("Couldn't save the due date — try reloading")
      setDueDay(toDateInput(task.due_date))
      setDueTime(task.due_has_time ? toTimeInput(task.due_date) : "")
    })
  }

  const resolved = task.status_category === "done"
  const options = allStatuses.filter((s) => s.group_id === task.status_group_id)

  // Move the task to another status list. The group is derived from status_id, so switching
  // points the task at the target group's first open status (see openStatusForGroup).
  const selectGroup = (groupId: string) => {
    if (groupId === task.status_group_id) return
    const target = openStatusForGroup(allStatuses, groupId)
    if (target) void setTaskStatus(db, id, target.id)
  }
  const dueState = dueDayState(task.due_date, resolved)
  const dueFieldClass =
    dueState === "overdue"
      ? "border-destructive/50 text-destructive"
      : dueState === "today"
        ? "border-warning/50 text-warning"
        : "border-border text-foreground"

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 shrink-0">
          <StatusControl
            current={{
              id: task.status_id,
              name: task.status_name,
              color: task.status_color,
              category: task.status_category,
            }}
            options={options}
            onSelect={(sid) => void setTaskStatus(db, id, sid)}
          />
        </div>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={saveTitle}
          placeholder="Task title"
          className="flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-lg font-medium text-foreground outline-none focus:border-ring focus:bg-background"
        />
      </div>

      {groups.length > 1 ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          List
          <select
            aria-label="Status list"
            value={task.status_group_id}
            onChange={(event) => selectGroup(event.target.value)}
            className="rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* Tags — all shown (no +k collapse; the detail has room). Click a chip to edit it;
          the picker assigns/creates. */}
      <div className="flex flex-wrap items-center gap-2">
        <TagChips tags={taskTags} taskId={id} max={99} />
        <TagPicker
          taskId={id}
          assignedIds={assignedIds}
          allTags={allTags}
          nextPosition={allTags.length}
        />
      </div>

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={saveDescription}
        placeholder="Add notes…"
        rows={5}
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Start
          <div className="flex gap-2">
            <input
              type="date"
              aria-label="Start date"
              value={startDay}
              onChange={(event) => saveStart(event.target.value, startTime)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
            <input
              type="time"
              aria-label="Start time"
              value={startTime}
              onChange={(event) => saveStart(startDay, event.target.value)}
              className="w-28 shrink-0 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            Due
            {dueState === "overdue" ? (
              <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                Overdue
              </span>
            ) : dueState === "today" ? (
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                Today
              </span>
            ) : null}
          </span>
          <div className="flex gap-2">
            <input
              type="date"
              aria-label="Due date"
              value={dueDay}
              onChange={(event) => saveDue(event.target.value, dueTime)}
              className={`min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-ring ${dueFieldClass}`}
            />
            <input
              type="time"
              aria-label="Due time"
              value={dueTime}
              onChange={(event) => saveDue(dueDay, event.target.value)}
              className={`w-28 shrink-0 rounded-lg border bg-background px-2 py-2 text-sm outline-none focus:border-ring ${dueFieldClass}`}
            />
          </div>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={async () => {
            await deleteWithUndo(db, task, toast)
            onDeleted?.()
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-destructive/50 hover:text-destructive"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
