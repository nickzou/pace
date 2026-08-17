import type { AbstractPowerSyncDatabase } from "@powersync/web"

// Client write helpers for the status library (P2-03). Each writes straight to local
// SQLite; the PowerSync connector replays it to the matching tRPC procedure (INSERT →
// create, UPDATE → update, DELETE → softDelete). Deletes are guarded server-side (the
// default group + system statuses are protected, tasks are reassigned) — the UI also
// hides those delete affordances so an optimistic delete can't bounce back.
const now = () => new Date().toISOString()

export function setCustomStatusesEnabled(
  db: AbstractPowerSyncDatabase,
  settingsId: string,
  enabled: boolean,
) {
  return db.execute(
    "UPDATE user_settings SET custom_statuses_enabled = ?, updated_at = ? WHERE id = ?",
    [enabled ? 1 : 0, now(), settingsId],
  )
}

export function createGroup(db: AbstractPowerSyncDatabase, name: string, position: number) {
  const ts = now()
  return db.execute(
    "INSERT INTO status_groups (id, name, is_default, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
    [crypto.randomUUID(), name, position, ts, ts],
  )
}

export function deleteGroup(db: AbstractPowerSyncDatabase, id: string) {
  return db.execute("DELETE FROM status_groups WHERE id = ?", [id])
}

export function createStatus(
  db: AbstractPowerSyncDatabase,
  groupId: string,
  name: string,
  color: string,
  category: string,
  position: number,
) {
  const ts = now()
  return db.execute(
    "INSERT INTO statuses (id, group_id, name, color, category, position, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    [crypto.randomUUID(), groupId, name, color, category, position, ts, ts],
  )
}

export function recolorStatus(db: AbstractPowerSyncDatabase, id: string, color: string) {
  return db.execute("UPDATE statuses SET color = ?, updated_at = ? WHERE id = ?", [
    color,
    now(),
    id,
  ])
}

export function deleteStatus(db: AbstractPowerSyncDatabase, id: string) {
  return db.execute("DELETE FROM statuses WHERE id = ?", [id])
}
