import { type ActivityMeta, insertActivities, taskUpdateActivities } from "@pace/api-client"
import type { AbstractPowerSyncDatabase } from "@powersync/react-native"
import * as Crypto from "expo-crypto"
import { bottomOfScopeKey } from "./order"

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
//
// Activity history (P3-08): a change and the activity row(s) that record it are written in
// ONE writeTransaction, so they capture atomically on-device and upload together. The
// diff/insert logic is shared (@pace/api-client) so web and mobile record identical entries;
// only the uuid factory is platform-specific.
const newId = () => Crypto.randomUUID()

// Create a task locally (replays as create). `parentId` makes it a subtask; the server runs
// the depth/cycle guard on upload. `statusId` is the caller's default open status. Returns
// the minted id.
export async function createTask(
  db: AbstractPowerSyncDatabase,
  opts: { title: string; statusId: string; parentId?: string | null },
): Promise<string> {
  const id = newId()
  const now = new Date().toISOString()
  // Mint a bottom-of-scope key so the new task appends to the end of its list (P2-06).
  const sortOrder = await bottomOfScopeKey(db, opts.parentId ?? null)
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      "INSERT INTO tasks (id, title, description, status_id, parent_id, sort_order, created_at, updated_at) VALUES (?, ?, '', ?, ?, ?, ?, ?)",
      [id, opts.title, opts.statusId, opts.parentId ?? null, sortOrder, now, now],
    )
    await insertActivities(tx, newId, [{ taskId: id, action: "created", createdAt: now }])
  })
  return id
}

// Re-parent a task, or promote it to top-level with parentId = null. Writes ONLY parent_id
// (isolated), so the connector routes it to the guarded setParent procedure rather than the
// generic update. The server rejects a move that would cycle or exceed the depth cap.
export async function setTaskParent(
  db: AbstractPowerSyncDatabase,
  id: string,
  parentId: string | null,
) {
  // Prior parent + both parents' titles, for the reparented entry's from/to snapshots.
  const [cur] = await db.getAll<{
    parent_id: string | null
    from_title: string | null
    to_title: string | null
  }>(
    `SELECT t.parent_id AS parent_id, fp.title AS from_title, tp.title AS to_title
       FROM tasks t
       LEFT JOIN tasks fp ON fp.id = t.parent_id
       LEFT JOIN tasks tp ON tp.id = ?
      WHERE t.id = ?`,
    [parentId, id],
  )
  const now = new Date().toISOString()
  await db.writeTransaction(async (tx) => {
    await tx.execute("UPDATE tasks SET parent_id = ?, updated_at = ? WHERE id = ?", [
      parentId,
      now,
      id,
    ])
    if (cur && cur.parent_id !== parentId) {
      await insertActivities(tx, newId, [
        {
          taskId: id,
          action: "reparented",
          fromValue: cur.parent_id,
          toValue: parentId,
          meta: { fromParentTitle: cur.from_title, toParentTitle: cur.to_title },
          createdAt: now,
        },
      ])
    }
  })
}

// Set (or clear) a task's recurrence (P2-08). Writes only these two columns → the connector routes
// it to the guarded setRecurrence procedure (like setTaskParent). `rule` null stops repeating; the
// rule carries its own DTSTART anchor (see @pace/validation withAnchor).
export async function setTaskRecurrence(
  db: AbstractPowerSyncDatabase,
  id: string,
  rule: string | null,
  regen: "advance" | "duplicate" | null,
) {
  const [cur] = await db.getAll<{ recurrence: string | null }>(
    "SELECT recurrence FROM tasks WHERE id = ?",
    [id],
  )
  const now = new Date().toISOString()
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      "UPDATE tasks SET recurrence = ?, recurrence_regen = ?, updated_at = ? WHERE id = ?",
      [rule, regen, now, id],
    )
    if (cur && cur.recurrence !== rule) {
      await insertActivities(tx, newId, [
        {
          taskId: id,
          action: "recurrence_changed",
          fromValue: cur.recurrence,
          toValue: rule,
          createdAt: now,
        },
      ])
    }
  })
}

// Set the task's status. resolved_at is left to the server (derived from the status's
// category on upload, then synced back), so we only touch status_id here.
export async function setTaskStatus(db: AbstractPowerSyncDatabase, id: string, statusId: string) {
  // Prior status + both statuses' name/colour/category, so the entry renders after either is
  // later renamed or deleted.
  const [cur] = await db.getAll<{
    from_id: string | null
    from_name: string | null
    from_color: string | null
    from_cat: string | null
    to_name: string | null
    to_color: string | null
    to_cat: string | null
  }>(
    `SELECT t.status_id AS from_id,
            fs.name AS from_name, fs.color AS from_color, fs.category AS from_cat,
            ts.name AS to_name, ts.color AS to_color, ts.category AS to_cat
       FROM tasks t
       LEFT JOIN statuses fs ON fs.id = t.status_id
       LEFT JOIN statuses ts ON ts.id = ?
      WHERE t.id = ?`,
    [statusId, id],
  )
  const now = new Date().toISOString()
  await db.writeTransaction(async (tx) => {
    await tx.execute("UPDATE tasks SET status_id = ?, updated_at = ? WHERE id = ?", [
      statusId,
      now,
      id,
    ])
    if (cur && cur.from_id !== statusId) {
      const meta: ActivityMeta = {}
      if (cur.from_name != null)
        meta.fromStatus = {
          name: cur.from_name,
          color: cur.from_color ?? "",
          category: cur.from_cat ?? "",
        }
      if (cur.to_name != null)
        meta.toStatus = { name: cur.to_name, color: cur.to_color ?? "", category: cur.to_cat ?? "" }
      await insertActivities(tx, newId, [
        {
          taskId: id,
          action: "status_changed",
          field: "status_id",
          fromValue: cur.from_id,
          toValue: statusId,
          meta,
          createdAt: now,
        },
      ])
    }
  })
}

// A partial update: writes only the columns provided, so start/due dates can be set or
// cleared (null) independently of title/notes. The keys come from the typed Task columns
// (not user input), so building the SET list from them is safe. Title/description edits and
// start/due reschedules each record an activity entry (P3-08).
export async function updateTask(
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
  if (cols.length === 0) return
  // Prior state for the diff (only the fields we log).
  const [prev] = await db.getAll<{
    title: string
    description: string
    start_date: string | null
    due_date: string | null
  }>("SELECT title, description, start_date, due_date FROM tasks WHERE id = ?", [id])
  const now = new Date().toISOString()
  const assignments = [...cols.map((c) => `${c} = ?`), "updated_at = ?"].join(", ")
  const values = [...cols.map((c) => fields[c] ?? null), now, id]
  const activities = prev
    ? taskUpdateActivities(id, prev, fields).map((a) => ({ ...a, createdAt: now }))
    : []
  await db.writeTransaction(async (tx) => {
    await tx.execute(`UPDATE tasks SET ${assignments} WHERE id = ?`, values)
    if (activities.length) await insertActivities(tx, newId, activities)
  })
}

type Toast = { show: (message: string, action?: { label: string; onClick: () => void }) => void }

type TagLink = { id: string; task_id: string; tag_id: string; created_at: string }

// Delete with Undo, extended to the whole subtree (P2-05) — the mobile twin of web's. Deleting
// a task also removes its descendants (captured with their tag links) so Undo restores the
// whole subtree, re-inserted TOP-DOWN so each child's create sees a live parent (the server's
// depth guard needs one). The server's create upsert clears deletedAt.
//
// Activity (P3-08): the delete records a `deleted` entry and Undo records a `restored` one —
// on the target task. Its own history survives the soft-delete (activity is never deleted).
export async function deleteWithUndo(db: AbstractPowerSyncDatabase, task: Task, toast: Toast) {
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

  await db.writeTransaction(async (tx) => {
    await tx.execute(`DELETE FROM tasks WHERE id IN (${holes})`, ids)
    await insertActivities(tx, newId, [
      { taskId: task.id, action: "deleted", createdAt: new Date().toISOString() },
    ])
  })

  const subCount = subtree.length - 1
  const message =
    subCount > 0 ? `Task and ${subCount} subtask${subCount > 1 ? "s" : ""} deleted` : "Task deleted"

  toast.show(message, {
    label: "Undo",
    onClick: () => {
      void (async () => {
        await db.writeTransaction(async (tx) => {
          for (const t of subtree) {
            await tx.execute(
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
            await tx.execute(
              "INSERT OR IGNORE INTO task_tags (id, task_id, tag_id, created_at) VALUES (?, ?, ?, ?)",
              [l.id, l.task_id, l.tag_id, l.created_at],
            )
          }
          await insertActivities(tx, newId, [
            { taskId: task.id, action: "restored", createdAt: new Date().toISOString() },
          ])
        })
      })()
    },
  })
}
