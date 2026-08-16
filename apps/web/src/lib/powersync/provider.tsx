import { useTRPCClient } from "@pace/api-client"
import { PowerSyncContext } from "@powersync/react"
import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { type ReactNode, useEffect, useState } from "react"

// The live, connected PowerSync database, cached at module scope so it SURVIVES
// route navigation. Previously the provider connected on every mount and
// disconnected on every unmount, so moving between the list and a task's detail
// route tore down and re-established the sync connection each time — the
// "Starting local database…" flash. Now we connect once and reuse it.
//
// Must stay client-only (see the caller): @powersync/web pulls in wa-sqlite (WASM
// + web workers), so nothing PowerSync-related may load during SSR. The DB
// instance is itself a lazy singleton (./db); this adds a cached *connection* on
// top. It's torn down only by clearDb() on an explicit sign-out — after which the
// `db.connected` check reconnects automatically on the next mount.
let cached: AbstractPowerSyncDatabase | null = null
let connecting: Promise<AbstractPowerSyncDatabase> | null = null

// Connect exactly once, even under StrictMode's double-mount — concurrent callers
// share the one in-flight promise.
function connectOnce(trpc: ReturnType<typeof useTRPCClient>): Promise<AbstractPowerSyncDatabase> {
  if (cached?.connected) return Promise.resolve(cached)
  if (!connecting) {
    connecting = (async () => {
      const [{ getDb, reconcileSchemaVersion }, { createConnector }] = await Promise.all([
        import("./db"),
        import("./connector"),
      ])
      const database = await getDb()
      const connector = createConnector(trpc)
      // Rebuild the local DB first if the client schema changed since it was last
      // built (else new columns sync on read but drop on upload). Runs before the
      // steady-state connect below.
      await reconcileSchemaVersion(database, connector)
      if (!database.connected) await database.connect(connector)
      cached = database
      return database
    })().finally(() => {
      connecting = null
    })
  }
  return connecting
}

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPCClient()
  // Provide synchronously when a live connection already exists → no flash when
  // navigating between routes. First mount (or post-sign-out) falls back to the
  // async connect below.
  const [db, setDb] = useState<AbstractPowerSyncDatabase | null>(() =>
    cached?.connected ? cached : null,
  )

  useEffect(() => {
    if (db) return
    let cancelled = false
    connectOnce(trpc)
      .then((database) => {
        if (!cancelled) setDb(database)
      })
      .catch((err) => console.error("PowerSync init failed", err))
    // No disconnect on unmount — the connection persists across route changes, so
    // there's no reconnect churn; clearDb() (sign-out) is the only teardown.
    return () => {
      cancelled = true
    }
  }, [db, trpc])

  if (!db) {
    return <p className="text-sm text-muted-foreground">Starting local database…</p>
  }

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
}
