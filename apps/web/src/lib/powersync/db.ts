import type { AbstractPowerSyncDatabase } from "@powersync/web"

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
