import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { bottomOfScopeKey } from "./order"

// The task shape the UI reads from local SQLite: the implicit `id` plus the synced
// columns. `status_id` references the task's status (P2-03); done-ness is derived by
// joining `statuses` for the category. `resolved_at` is server-owned (synced down).
// Timestamps are ISO strings; the *_has_time flags are 0/1 (SQLite has no bool/date).
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
  // Subtask hierarchy (P2-05): the parent task's id, or null for a top-level task.
  parent_id: string | null
  // Manual ordering (P2-06): the fractional sort key within the parent scope.
  sort_order: string
  created_at: string
  updated_at: string
}

// Every write goes straight to local SQLite; the PowerSync connector replays them to
// the API in the background (INSERT → create, UPDATE → update, DELETE → softDelete).
// There's no cache to invalidate — the live useQuery cursors refresh.

// Create a task locally (replays as create). `parentId` makes it a subtask; the server
// runs the depth/cycle guard on upload. `statusId` is the caller's default open status —
// same one the top-level composer uses. Returns the minted id.
export async function createTask(
  db: AbstractPowerSyncDatabase,
  opts: { title: string; statusId: string; parentId?: string | null },
): Promise<string> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  // Mint a bottom-of-scope key so the new task appends to the end of its list (P2-06).
  const sortOrder = await bottomOfScopeKey(db, opts.parentId ?? null)
  await db.execute(
    "INSERT INTO tasks (id, title, description, status_id, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, '', ?, ?, ?, ?, ?)",
    [id, opts.title, opts.statusId, opts.parentId ?? null, sortOrder, now, now],
  )
  return id
}

// Re-parent a task, or promote it to top-level with parentId = null. Writes ONLY parent_id
// (isolated), so the connector routes it to the guarded setParent procedure rather than the
// generic update. The server rejects a move that would cycle or exceed the depth cap.
export function setTaskParent(db: AbstractPowerSyncDatabase, id: string, parentId: string | null) {
  return db.execute("UPDATE tasks SET parent_id = ?, updated_at = ? WHERE id = ?", [
    parentId,
    new Date().toISOString(),
    id,
  ])
}

// Set (or clear) a task's recurrence (P2-08). Writes only these two columns, so the connector
// routes it to the guarded setRecurrence procedure (like setTaskParent). `rule` null stops
// repeating; `rule` carries its own DTSTART anchor (see @pace/validation/recurrence withAnchor).
export function setTaskRecurrence(
  db: AbstractPowerSyncDatabase,
  id: string,
  rule: string | null,
  regen: "advance" | "duplicate" | null,
) {
  return db.execute(
    "UPDATE tasks SET recurrence = ?, recurrence_regen = ?, updated_at = ? WHERE id = ?",
    [rule, regen, new Date().toISOString(), id],
  )
}

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

type TagLink = { id: string; task_id: string; tag_id: string; created_at: string }

// Delete with Undo, extended to the whole subtree (P2-05). Deleting a task also removes its
// descendants — captured here (with their tag links) so Undo restores the entire subtree.
// The local DELETE replays as softDelete (the server cascades server-side too); the row(s)
// drop out of the sync stream. Undo re-inserts every row TOP-DOWN (parents before children)
// so each child's create sees a live parent — the server's depth guard needs one — then
// re-inserts the tag links (idempotent). The server's create upsert clears deletedAt.
export async function deleteWithUndo(db: AbstractPowerSyncDatabase, task: Task, toast: Toast) {
  // The task + all descendants, shallowest-first (so undo re-inserts parents before children).
  const subtree = await db.getAll<Task & { _depth: number }>(
    `WITH RECURSIVE sub(id, depth) AS (
       SELECT id, 0 FROM tasks WHERE id = ?
       UNION ALL
       SELECT t.id, sub.depth + 1 FROM tasks t JOIN sub ON t.parent_id = sub.id
     )
     SELECT t.*, sub.depth AS _depth FROM tasks t JOIN sub ON t.id = sub.id ORDER BY sub.depth`,
    [task.id],
  )
  const ids = subtree.map((t) => t.id)
  const holes = ids.map(() => "?").join(", ")
  const links = await db.getAll<TagLink>(
    `SELECT id, task_id, tag_id, created_at FROM task_tags WHERE task_id IN (${holes})`,
    ids,
  )

  await db.execute(`DELETE FROM tasks WHERE id IN (${holes})`, ids)

  const subCount = subtree.length - 1
  const message =
    subCount > 0 ? `Task and ${subCount} subtask${subCount > 1 ? "s" : ""} deleted` : "Task deleted"

  toast.show(message, {
    label: "Undo",
    onClick: () => {
      void (async () => {
        for (const t of subtree) {
          await db.execute(
            "INSERT INTO tasks (id, title, description, status_id, resolved_at, start_date, due_date, start_has_time, due_has_time, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              t.id,
              t.title,
              t.description,
              t.status_id,
              t.resolved_at,
              t.start_date,
              t.due_date,
              t.start_has_time,
              t.due_has_time,
              t.parent_id,
              t.sort_order,
              t.created_at,
              t.updated_at,
            ],
          )
        }
        for (const l of links) {
          await db.execute(
            "INSERT OR IGNORE INTO task_tags (id, task_id, tag_id, created_at) VALUES (?, ?, ?, ?)",
            [l.id, l.task_id, l.tag_id, l.created_at],
          )
        }
      })()
    },
  })
}
