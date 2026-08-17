import type { AbstractPowerSyncDatabase } from "@powersync/react-native"

// The task shape the UI reads from local SQLite: the implicit `id` plus the synced
// columns. `status_id` references the task's status (P2-03); done-ness is derived by
// joining `statuses` for the category. `resolved_at` is server-owned (synced down).
// The mobile twin of apps/web's tasks/mutations.ts.
export type Task = {
  id: string
  title: string
  description: string
  status_id: string
  resolved_at: string | null
  start_date: string | null
  due_date: string | null
  start_has_time: number
  due_has_time: number
  created_at: string
  updated_at: string
}

// Every write goes straight to local SQLite; the PowerSync connector replays them to
// the API in the background (INSERT → create, UPDATE → update, DELETE → softDelete).
// There's no cache to invalidate — the live useQuery cursors refresh.

// Set the task's status. resolved_at is left to the server (derived from the status's
// category on upload, then synced back), so we only touch status_id here.
export function setTaskStatus(db: AbstractPowerSyncDatabase, id: string, statusId: string) {
  return db.execute("UPDATE tasks SET status_id = ?, updated_at = ? WHERE id = ?", [
    statusId,
    new Date().toISOString(),
    id,
  ])
}

// A partial update: writes only the columns provided, so start/due dates can be set or
// cleared (null) independently of title/notes. The keys come from the typed Task columns
// (not user input), so building the SET list from them is safe.
export function updateTask(
  db: AbstractPowerSyncDatabase,
  id: string,
  fields: Partial<
    Pick<
      Task,
      "title" | "description" | "start_date" | "due_date" | "start_has_time" | "due_has_time"
    >
  >,
) {
  const cols = Object.keys(fields) as (keyof typeof fields)[]
  if (cols.length === 0) return Promise.resolve()
  const assignments = [...cols.map((c) => `${c} = ?`), "updated_at = ?"].join(", ")
  const values = [...cols.map((c) => fields[c] ?? null), new Date().toISOString(), id]
  return db.execute(`UPDATE tasks SET ${assignments} WHERE id = ?`, values)
}

type Toast = { show: (message: string, action?: { label: string; onClick: () => void }) => void }

// Delete with Undo, built on the soft-delete tombstone. The delete is a local DELETE —
// it replays as softDelete, stamping deletedAt, and the row drops out of the sync stream.
// Undo re-inserts the captured row with the same id, which replays as a create; the
// server's create upsert clears deletedAt, restoring it. Ops replay in order.
export async function deleteWithUndo(db: AbstractPowerSyncDatabase, task: Task, toast: Toast) {
  await db.execute("DELETE FROM tasks WHERE id = ?", [task.id])
  toast.show("Task deleted", {
    label: "Undo",
    onClick: () => {
      void db.execute(
        "INSERT INTO tasks (id, title, description, status_id, resolved_at, start_date, due_date, start_has_time, due_has_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          task.id,
          task.title,
          task.description,
          task.status_id,
          task.resolved_at,
          task.start_date,
          task.due_date,
          task.start_has_time,
          task.due_has_time,
          task.created_at,
          task.updated_at,
        ],
      )
    },
  })
}
