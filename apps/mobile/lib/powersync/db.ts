import { PowerSyncDatabase } from "@powersync/react-native"
import { AppSchema } from "./schema"

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
