import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/web"

// Lazy, browser-only singleton. The dynamic import keeps @powersync/web (wa-sqlite:
// WASM + web workers) out of SSR — this module is import-safe (type-only at the
// top), so it can be referenced from anywhere, including auth-client.
//
// It's a singleton for the same reason as mobile: a remount (or a transient
// logout) must not recreate or wipe the DB, or an offline write waiting to upload
// would be lost. Clearing happens only on an explicit sign-out.
let dbPromise: Promise<AbstractPowerSyncDatabase> | null = null

export function getDb(): Promise<AbstractPowerSyncDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { PowerSyncDatabase, WASQLiteVFS } = await import("@powersync/web")
      const { AppSchema } = await import("./schema")
      // The desktop app (Tauri, served from tauri://) runs in a WebKitGTK webview
      // that doesn't support the OPFS VFS wa-sqlite defaults to — so on desktop use
      // the IndexedDB VFS, which every engine supports. Real browsers keep the
      // default (OPFS: faster, and validated by the web e2e).
      const isDesktop =
        window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost"
      return new PowerSyncDatabase({
        schema: AppSchema,
        database: {
          dbFilename: "pace.db",
          // Tauri's WebKitGTK webview: use the IndexedDB VFS (no OPFS) and run
          // SQLite on the main thread. Packaged tauri:// web/shared workers don't
          // load reliably, which hung the default worker-based setup. A single-
          // window desktop app doesn't need the worker offload or multi-tab sync.
          ...(isDesktop
            ? {
                vfs: WASQLiteVFS.IDBBatchAtomicVFS,
                useWebWorker: false,
                enableMultiTabs: false,
              }
            : {}),
        },
      })
    })()
  }
  return dbPromise
}

// Wipe local data — call this ONLY on an explicit sign-out. No-op if the DB was
// never opened (e.g. SSR, or a user who never reached the app).
export async function clearDb(): Promise<void> {
  if (!dbPromise) return
  const db = await dbPromise
  await db.disconnectAndClear()
}

const SCHEMA_VERSION_KEY = "pace.powersync.schemaVersion"

// Rebuild the local DB when the client schema (./schema) has changed since it was
// last built. PowerSync migrates read views on load, but NOT the upload/crud
// capture — so after a column is added, its value syncs on read yet is dropped on
// upload until the DB is rebuilt (what a manual sign-out did by hand). We run this
// before connecting so returning users self-heal. Pending offline writes are
// flushed first so an upgrade never discards them; if they can't flush (offline),
// we defer the rebuild to a later load rather than lose them. Best-effort: any
// failure leaves the existing DB in place and the app still starts.
export async function reconcileSchemaVersion(
  db: AbstractPowerSyncDatabase,
  connector: PowerSyncBackendConnector,
): Promise<void> {
  if (typeof localStorage === "undefined") return
  try {
    const { SCHEMA_VERSION } = await import("./schema")
    const stored = localStorage.getItem(SCHEMA_VERSION_KEY)
    if (stored === SCHEMA_VERSION) return
    // First run under the guard (no stored version): assume the DB already matches
    // the current schema (a fresh DB, or one cleared by hand) — just record it.
    // Only a real version change forces a rebuild.
    if (stored !== null) {
      if (!(await flushPendingWrites(db, connector))) return // offline — defer, keep writes
      await db.disconnectAndClear()
    }
    localStorage.setItem(SCHEMA_VERSION_KEY, SCHEMA_VERSION)
  } catch (err) {
    console.error("PowerSync schema reconcile failed; keeping the existing local DB", err)
  }
}

// Drain the local write queue before a rebuild so no un-uploaded edit is lost.
// Returns false if it can't empty within the timeout (e.g. offline), so the caller
// can defer clearing. No-op fast path when the queue is already empty.
async function flushPendingWrites(
  db: AbstractPowerSyncDatabase,
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
