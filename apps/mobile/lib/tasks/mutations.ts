import type { AbstractPowerSyncDatabase } from "@powersync/react-native"

// The task shape the UI reads from local SQLite: the implicit `id` plus the
// synced columns (completed is 0/1, timestamps are ISO strings — SQLite has no
// boolean/timestamp types). The mobile twin of apps/web's tasks/mutations.ts.
export type Task = {
  id: string
  title: string
  description: string
  completed: number
  created_at: string
  updated_at: string
}

// Every write goes straight to local SQLite; the PowerSync connector replays them
// to the API in the background (INSERT → create, UPDATE → update, DELETE →
// softDelete). There's no cache to invalidate — the live useQuery cursors refresh.

export function toggleTask(db: AbstractPowerSyncDatabase, task: Pick<Task, "id" | "completed">) {
  return db.execute("UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?", [
    task.completed ? 0 : 1,
    new Date().toISOString(),
    task.id,
  ])
}

export function updateTask(
  db: AbstractPowerSyncDatabase,
  id: string,
  fields: { title: string; description: string },
) {
  return db.execute("UPDATE tasks SET title = ?, description = ?, updated_at = ? WHERE id = ?", [
    fields.title,
    fields.description,
    new Date().toISOString(),
    id,
  ])
}

type Toast = { show: (message: string, action?: { label: string; onClick: () => void }) => void }

// Delete with Undo, built on the soft-delete tombstone. The delete is a local
// DELETE — it replays as softDelete, stamping deletedAt, and the row drops out of
// the sync stream. Undo re-inserts the captured row with the same id, which
// replays as a create; the server's create upsert clears deletedAt, restoring it.
// Ops replay in order, so this reconciles even if the delete happened offline.
export async function deleteWithUndo(db: AbstractPowerSyncDatabase, task: Task, toast: Toast) {
  await db.execute("DELETE FROM tasks WHERE id = ?", [task.id])
  toast.show("Task deleted", {
    label: "Undo",
    onClick: () => {
      void db.execute(
        "INSERT INTO tasks (id, title, description, completed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [task.id, task.title, task.description, task.completed, task.created_at, task.updated_at],
      )
    },
  })
}
