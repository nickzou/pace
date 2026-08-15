import { usePowerSync, useQuery } from "@powersync/react"
import { useEffect, useRef, useState } from "react"
import {
  combineLocal,
  DUE_FALLBACK,
  isOverdue,
  START_FALLBACK,
  toDateInput,
  toTimeInput,
} from "#/lib/tasks/dates"
import { deleteWithUndo, type Task, toggleTask, updateTask } from "#/lib/tasks/mutations"
import { useToast } from "#/lib/toast"

// The single-task view/editor shared by the quick modal and the dedicated
// /tasks/$taskId route. Reads the task live from local SQLite; title/notes edits
// save on blur; delete runs the Undo flow. The edit fields seed from the row only
// when the id first loads, so a background sync can't clobber in-progress typing.
export function TaskDetail({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const db = usePowerSync()
  const toast = useToast()
  const { data: rows, isLoading } = useQuery<Task>(
    "SELECT id, title, description, completed, start_date, due_date, start_has_time, due_has_time, created_at, updated_at FROM tasks WHERE id = ?",
    [id],
  )
  const task = rows[0]

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [startDay, setStartDay] = useState("")
  const [startTime, setStartTime] = useState("")
  const [dueDay, setDueDay] = useState("")
  const [dueTime, setDueTime] = useState("")
  const seededFor = useRef<string | null>(null)

  useEffect(() => {
    if (task && seededFor.current !== task.id) {
      seededFor.current = task.id
      setTitle(task.title)
      setDescription(task.description)
      setStartDay(toDateInput(task.start_date))
      setStartTime(task.start_has_time ? toTimeInput(task.start_date) : "")
      setDueDay(toDateInput(task.due_date))
      setDueTime(task.due_has_time ? toTimeInput(task.due_date) : "")
    }
  }, [task])

  if (isLoading) return <p className="text-sm text-neutral-500">Loading…</p>
  if (!task) return <p className="text-sm text-neutral-400">This task no longer exists.</p>

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

  const overdue = isOverdue(task.due_date, task.completed)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => void toggleTask(db, task)}
          aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          className={`mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
            task.completed
              ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
              : "border-neutral-600"
          }`}
        >
          {task.completed ? "✓" : ""}
        </button>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={saveTitle}
          placeholder="Task title"
          className="flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-lg font-medium text-neutral-100 outline-none focus:border-neutral-700 focus:bg-neutral-950"
        />
      </div>

      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        onBlur={saveDescription}
        placeholder="Add notes…"
        rows={5}
        className="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-sky-500"
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Start
          <div className="flex gap-2">
            <input
              type="date"
              aria-label="Start date"
              value={startDay}
              onChange={(event) => saveStart(event.target.value, startTime)}
              className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none [color-scheme:dark] focus:border-sky-500"
            />
            <input
              type="time"
              aria-label="Start time"
              value={startTime}
              onChange={(event) => saveStart(startDay, event.target.value)}
              className="w-28 shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-sm text-neutral-200 outline-none [color-scheme:dark] focus:border-sky-500"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          <span className="flex items-center gap-2">
            Due
            {overdue ? (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                Overdue
              </span>
            ) : null}
          </span>
          <div className="flex gap-2">
            <input
              type="date"
              aria-label="Due date"
              value={dueDay}
              onChange={(event) => saveDue(event.target.value, dueTime)}
              className={`min-w-0 flex-1 rounded-lg border bg-neutral-950 px-3 py-2 text-sm outline-none [color-scheme:dark] focus:border-sky-500 ${
                overdue ? "border-red-500/50 text-red-300" : "border-neutral-800 text-neutral-200"
              }`}
            />
            <input
              type="time"
              aria-label="Due time"
              value={dueTime}
              onChange={(event) => saveDue(dueDay, event.target.value)}
              className={`w-28 shrink-0 rounded-lg border bg-neutral-950 px-2 py-2 text-sm outline-none [color-scheme:dark] focus:border-sky-500 ${
                overdue ? "border-red-500/50 text-red-300" : "border-neutral-800 text-neutral-200"
              }`}
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
          className="rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-neutral-400 transition hover:border-red-500/50 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
