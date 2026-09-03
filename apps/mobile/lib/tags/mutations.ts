import { insertActivities } from "@pace/api-client"
import type { AbstractPowerSyncDatabase } from "@powersync/react-native"
import * as Crypto from "expo-crypto"

// Client write helpers for tags (P2-04) — the mobile twin of apps/web's tags/mutations.ts.
// Each writes to local SQLite; the connector replays it to the matching tRPC procedure.
//
// Note on delete/undo: a task's soft-delete does NOT cascade to its task_tags links
// (cascade fires only on a hard delete), so links survive a task delete + undo untouched.
const now = () => new Date().toISOString()
const newId = () => Crypto.randomUUID()

// Returns the minted id so callers can create-and-assign in one step (the tag picker).
export async function createTag(
  db: AbstractPowerSyncDatabase,
  name: string,
  color: string,
  position: number,
): Promise<string> {
  const id = Crypto.randomUUID()
  const ts = now()
  await db.execute(
    "INSERT INTO tags (id, name, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, color, position, ts, ts],
  )
  return id
}

export function renameTag(db: AbstractPowerSyncDatabase, id: string, name: string) {
  return db.execute("UPDATE tags SET name = ?, updated_at = ? WHERE id = ?", [name, now(), id])
}

export function recolorTag(db: AbstractPowerSyncDatabase, id: string, color: string) {
  return db.execute("UPDATE tags SET color = ?, updated_at = ? WHERE id = ?", [color, now(), id])
}

export function deleteTag(db: AbstractPowerSyncDatabase, id: string) {
  return db.execute("DELETE FROM tags WHERE id = ?", [id])
}

// Reorder: write each tag's new position (replays as individual PATCH → tags.update).
export async function reorderTags(db: AbstractPowerSyncDatabase, orderedIds: string[]) {
  const ts = now()
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute("UPDATE tags SET position = ?, updated_at = ? WHERE id = ?", [
      i,
      ts,
      orderedIds[i],
    ])
  }
}

// Assign / unassign a tag to a task via the join. The link id is deterministic, so the
// insert is idempotent (OR IGNORE) and converges across offline devices. Each records a
// tags_changed activity entry (P3-08) — with the tag's name/colour snapshot — in the same
// local tx as the link write.
export async function assignTag(db: AbstractPowerSyncDatabase, taskId: string, tagId: string) {
  const ts = now()
  const [tag] = await db.getAll<{ name: string; color: string }>(
    "SELECT name, color FROM tags WHERE id = ?",
    [tagId],
  )
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      "INSERT OR IGNORE INTO task_tags (id, task_id, tag_id, created_at) VALUES (?, ?, ?, ?)",
      [`${taskId}_${tagId}`, taskId, tagId, ts],
    )
    await insertActivities(tx, newId, [
      {
        taskId,
        action: "tags_changed",
        field: "added",
        toValue: tagId,
        meta: tag ? { tag } : null,
        createdAt: ts,
      },
    ])
  })
}

export async function unassignTag(db: AbstractPowerSyncDatabase, taskId: string, tagId: string) {
  const ts = now()
  const [tag] = await db.getAll<{ name: string; color: string }>(
    "SELECT name, color FROM tags WHERE id = ?",
    [tagId],
  )
  await db.writeTransaction(async (tx) => {
    await tx.execute("DELETE FROM task_tags WHERE id = ?", [`${taskId}_${tagId}`])
    await insertActivities(tx, newId, [
      {
        taskId,
        action: "tags_changed",
        field: "removed",
        fromValue: tagId,
        meta: tag ? { tag } : null,
        createdAt: ts,
      },
    ])
  })
}
