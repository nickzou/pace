import { useTRPCClient } from "@pace/api-client"
import { PowerSyncContext } from "@powersync/react"
import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { type ReactNode, useEffect, useState } from "react"

// Provides a connected PowerSync database to its children. Mount it only on the
// client, behind a signed-in check (see the caller) — it should never render
// during SSR, because @powersync/web pulls in wa-sqlite (WASM + web workers),
// which only exist in the browser. That's why the SDK, schema, and connector are
// all dynamically imported inside the effect rather than imported at module top.
export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPCClient()
  const [db, setDb] = useState<AbstractPowerSyncDatabase | null>(null)

  useEffect(() => {
    let database: AbstractPowerSyncDatabase | undefined
    let cancelled = false

    void (async () => {
      const [{ PowerSyncDatabase }, { AppSchema }, { createConnector }] = await Promise.all([
        import("@powersync/web"),
        import("./schema"),
        import("./connector"),
      ])
      database = new PowerSyncDatabase({
        schema: AppSchema,
        database: { dbFilename: "pace.db" },
      })
      await database.connect(createConnector(trpc))
      if (!cancelled) setDb(database)
    })().catch((err) => console.error("PowerSync init failed", err))

    return () => {
      cancelled = true
      // The caller unmounts this on sign-out, so wipe the local DB — the next
      // user must not inherit the previous user's rows.
      database?.disconnectAndClear().catch(() => {})
    }
  }, [trpc])

  if (!db) {
    return <p className="text-sm text-neutral-500">Starting local database…</p>
  }

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
}
