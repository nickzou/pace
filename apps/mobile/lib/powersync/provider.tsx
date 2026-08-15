import { useTRPCClient } from "@pace/api-client"
import { PowerSyncContext } from "@powersync/react"
import { type ReactNode, useEffect } from "react"
import { createConnector } from "./connector"
import { getDb, reconcileSchemaVersion } from "./db"

// Provides the app-lifetime PowerSync database (see ./db) to its children, and
// keeps it connected while mounted. No SSR gymnastics here — React Native is
// always on-device.
export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPCClient()
  const db = getDb()

  useEffect(() => {
    let cancelled = false
    const connector = createConnector(trpc)
    // Rebuild the local DB first if the client schema changed since it was last
    // built (else new columns sync on read but drop on upload), then connect.
    void reconcileSchemaVersion(db, connector).then(() => {
      if (!cancelled) void db.connect(connector)
    })
    // On unmount (e.g. a transient session blip flipping to the auth screen),
    // just stop syncing — do NOT clear. The local rows and pending upload queue
    // must survive so an offline write isn't lost on a reconnect. Clearing
    // happens only on an explicit sign-out (see lib/auth-client).
    return () => {
      cancelled = true
      void db.disconnect()
    }
  }, [db, trpc])

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>
}
