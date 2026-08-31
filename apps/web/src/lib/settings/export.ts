import type { AbstractPowerSyncDatabase } from "@powersync/web"

// The user's data, straight from the local synced SQLite (so an export works offline and reflects
// exactly what the client holds). One array per table; the shape mirrors the PowerSync schema.
const TABLES = ["tasks", "status_groups", "statuses", "tags", "task_tags", "user_settings"] as const

export interface DataExport {
  exportedAt: string
  tables: Record<string, unknown[]>
}

export async function collectExport(
  db: AbstractPowerSyncDatabase,
  exportedAt: string,
): Promise<DataExport> {
  const tables: Record<string, unknown[]> = {}
  for (const table of TABLES) {
    tables[table] = await db.getAll(`SELECT * FROM ${table}`)
  }
  return { exportedAt, tables }
}
