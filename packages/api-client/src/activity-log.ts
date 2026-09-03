// Task activity history (P3-08) — the SHARED capture logic, so web and mobile record identical
// entries (per the repo's prefer-shared-over-mirrored rule). Two halves:
//   - pure builders that turn a task change into zero-or-more immutable activity rows, and
//   - `insertActivities`, which writes them to local SQLite (replays up as activity.create).
// Kept append-only: we only ever INSERT. Authored client-side so the feed reflects offline
// edits instantly and no event is lost when PowerSync coalesces same-row task PATCHes.

// A minimal executor — satisfied by both an AbstractPowerSyncDatabase and a write-transaction
// context, so callers can insert inside the SAME tx as the task write (atomic on-device).
type Executor = { execute: (sql: string, params?: unknown[]) => Promise<unknown> }

export type ActivityAction =
  | "created"
  | "title_changed"
  | "description_changed"
  | "status_changed"
  | "start_changed"
  | "due_changed"
  | "reparented"
  | "recurrence_changed"
  | "tags_changed"
  | "deleted"
  | "restored"

type StatusSnapshot = { name: string; color: string; category: string }
type TagSnapshot = { name: string; color: string }

// Display snapshots captured at write time so an entry renders truthfully later (mirrors
// @pace/validation's ActivityMeta).
export type ActivityMeta = {
  fromStatus?: StatusSnapshot
  toStatus?: StatusSnapshot
  tag?: TagSnapshot
  fromParentTitle?: string | null
  toParentTitle?: string | null
  recurrenceText?: string | null
}

// A row to append, minus the id (minted by the caller's platform crypto) and recorded_at
// (server-owned). `createdAt` defaults to now at insert time.
export type ActivityRow = {
  taskId: string
  action: ActivityAction
  field?: string | null
  fromValue?: string | null
  toValue?: string | null
  meta?: ActivityMeta | null
  createdAt?: string
}

// The task columns a field-level diff looks at (the local SQLite shape).
type TaskFields = {
  title: string
  description: string
  start_date: string | null
  due_date: string | null
}

// Diff a task update into activity rows — title/description edits and start/due reschedules.
// Only fields actually present in `next` and genuinely changed emit a row; a range move that
// touches both start and due emits two (kept separate so the due_changed count stays clean).
export function taskUpdateActivities(
  taskId: string,
  prev: TaskFields,
  next: Partial<TaskFields>,
): ActivityRow[] {
  const rows: ActivityRow[] = []
  if (next.title !== undefined && next.title !== prev.title)
    rows.push({
      taskId,
      action: "title_changed",
      field: "title",
      fromValue: prev.title,
      toValue: next.title,
    })
  if (next.description !== undefined && next.description !== prev.description)
    rows.push({ taskId, action: "description_changed", field: "description" })
  if (next.start_date !== undefined && next.start_date !== prev.start_date)
    rows.push({
      taskId,
      action: "start_changed",
      field: "start_date",
      fromValue: prev.start_date,
      toValue: next.start_date ?? null,
    })
  if (next.due_date !== undefined && next.due_date !== prev.due_date)
    rows.push({
      taskId,
      action: "due_changed",
      field: "due_date",
      fromValue: prev.due_date,
      toValue: next.due_date ?? null,
    })
  return rows
}

// Insert activity rows into local SQLite. `newId` is the platform's uuid factory (web:
// crypto.randomUUID, mobile: expo-crypto). `recorded_at` is seeded to created_at locally as a
// placeholder — the server stamps the authoritative value, which syncs back down over this row.
export async function insertActivities(
  exec: Executor,
  newId: () => string,
  rows: ActivityRow[],
): Promise<void> {
  for (const r of rows) {
    const now = r.createdAt ?? new Date().toISOString()
    await exec.execute(
      "INSERT INTO task_activity (id, task_id, action, field, from_value, to_value, meta, created_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        newId(),
        r.taskId,
        r.action,
        r.field ?? null,
        r.fromValue ?? null,
        r.toValue ?? null,
        r.meta ? JSON.stringify(r.meta) : null,
        now,
        now,
      ],
    )
  }
}
