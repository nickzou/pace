import { type PowerSyncBackendConnector, PowerSyncDatabase } from "@powersync/react-native"
import * as SecureStore from "expo-secure-store"
import { AppSchema, SCHEMA_VERSION } from "./schema"

// A single PowerSync database for the app's lifetime, kept as a module singleton
// (not per-mount). This is what makes offline writes durable: a transient session
// blip unmounts the provider, and if that recreated or wiped the DB, an offline
// write made just before a reconnect would be lost. The singleton — plus clearing
// ONLY on explicit sign-out — keeps the local rows and the pending upload queue
// intact across remounts.
let instance: PowerSyncDatabase | null = null

export function getDb(): PowerSyncDatabase {
  if (!instance) {
    instance = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: "pace.db" },
    })
  }
  return instance
}

// Wipe local data — call this ONLY on an explicit sign-out, so the next user
// starts clean. Never on an incidental unmount.
export async function clearDb(): Promise<void> {
  if (instance) await instance.disconnectAndClear()
}

// Persisted OUTSIDE the DB (SecureStore) so it survives disconnectAndClear. It's
// not a secret, just the only KV already wired into the native build.
const SCHEMA_VERSION_KEY = "pace.powersync.schemaVersion"

// Rebuild the local DB when the client schema (./schema) has changed since it was
// last built. PowerSync migrates read views on load, but NOT the upload/crud
// capture — so after a column is added, its value syncs on read yet is dropped on
// upload until the DB is rebuilt. We run this before connecting so a returning user
// (a new app build over an existing pace.db) self-heals. Pending offline writes are
// flushed first so an upgrade never discards them; if they can't flush (offline),
// we defer the rebuild. Best-effort: any failure leaves the existing DB in place.
export async function reconcileSchemaVersion(
  db: PowerSyncDatabase,
  connector: PowerSyncBackendConnector,
): Promise<void> {
  try {
    const stored = await SecureStore.getItemAsync(SCHEMA_VERSION_KEY)
    if (stored === SCHEMA_VERSION) return
    // Rebuild when this DB was built with a KNOWN older version, or when it predates
    // the guard (no stored version) yet already holds rows — i.e. an existing user
    // whose local schema is stale. A fresh/empty DB (no rows before the first sync)
    // is already current, so just record the version without a needless clear.
    const staleWithData =
      stored === null && (await db.getAll("SELECT 1 FROM tasks LIMIT 1")).length > 0
    if (stored !== null || staleWithData) {
      if (!(await flushPendingWrites(db, connector))) return // offline — defer, keep writes
      await db.disconnectAndClear()
    }
    await SecureStore.setItemAsync(SCHEMA_VERSION_KEY, SCHEMA_VERSION)
  } catch (err) {
    console.error("PowerSync schema reconcile failed; keeping the existing local DB", err)
  }
}

// Drain the local write queue before a rebuild so no un-uploaded edit is lost.
// Returns false if it can't empty within the timeout (e.g. offline).
async function flushPendingWrites(
  db: PowerSyncDatabase,
  connector: PowerSyncBackendConnector,
  timeoutMs = 15000,
): Promise<boolean> {
  if ((await db.getUploadQueueStats()).count === 0) return true
  if (!db.connected) await db.connect(connector)
  const deadline = Date.now() + timeoutMs
  while ((await db.getUploadQueueStats()).count > 0) {
    if (Date.now() > deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return true
}
