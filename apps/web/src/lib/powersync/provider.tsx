import { useTRPCClient } from "@pace/api-client"
import { PowerSyncContext } from "@powersync/react"
import type { AbstractPowerSyncDatabase } from "@powersync/web"
import { type ReactNode, useEffect, useState } from "react"

// Provides a connected PowerSync database to its children. Mount it only on the
// client, behind a signed-in check (see the caller) — it must never render during
// SSR, because @powersync/web pulls in wa-sqlite (WASM + web workers), which only
// exists in the browser. The DB itself is a lazy singleton (./db) that dynamic-
// imports the SDK, so nothing PowerSync-related loads server-side.
export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPCClient()
  const [db, setDb] = useState<AbstractPowerSyncDatabase | null>(null)

  useEffect(() => {
    let database: AbstractPowerSyncDatabase | undefined
    let cancelled = false

    void (async () => {
      const [{ getDb }, { createConnector }] = await Promise.all([
        import("./db"),
        import("./connector"),
      ])
      database = await getDb()
      await database.connect(createConnector(trpc))
      if (!cancelled) setDb(database)
    })().catch((err) => console.error("PowerSync init failed", err))

    return () => {
      cancelled = true
      // Disconnect but do NOT clear — a transient unmount (navigation, a session
      // blip) must not drop local rows or the pending upload queue. Clearing
      // happens only on an explicit sign-out (see lib/auth-client).
      void database?.disconnect()
    }
  }, [trpc])

  if (!db) {
    return <p className="text-sm text-neutral-500">Starting local database…</p>
  }

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
}
