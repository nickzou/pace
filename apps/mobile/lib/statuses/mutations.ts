import type { AbstractPowerSyncDatabase } from "@powersync/react-native"
import * as Crypto from "expo-crypto"

// Client write helpers for the status library (P2-03) — the mobile twin of apps/web's
// statuses/mutations.ts. Each writes to local SQLite; the connector replays it to the
// matching tRPC procedure. Deletes are guarded server-side (default group + system
// statuses protected, tasks reassigned); the UI also hides those affordances.
const now = () => new Date().toISOString()

export function setCustomStatusesEnabled(
  db: AbstractPowerSyncDatabase,
  settingsId: string,
  enabled: boolean,
) {
  // Only custom_statuses_enabled — the client user_settings table doesn't carry
  // updated_at, and the connector's settings.set ignores timestamps anyway.
  return db.execute("UPDATE user_settings SET custom_statuses_enabled = ? WHERE id = ?", [
    enabled ? 1 : 0,
    settingsId,
  ])
}

export function createGroup(db: AbstractPowerSyncDatabase, name: string, position: number) {
  const ts = now()
  return db.execute(
    "INSERT INTO status_groups (id, name, is_default, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)",
    [Crypto.randomUUID(), name, position, ts, ts],
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
    [Crypto.randomUUID(), groupId, name, color, category, position, ts, ts],
  )
}

export function deleteStatus(db: AbstractPowerSyncDatabase, id: string) {
  return db.execute("DELETE FROM statuses WHERE id = ?", [id])
}
