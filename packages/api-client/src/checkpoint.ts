import type { Task } from "@pace/validation"
import { createClient } from "./client"

// Compile-time checkpoint (M09): the backend's return types reach the client
// with zero manual typing. `tasks.list.query()` is inferred straight from
// AppRouter — if its output ever drifts from Task[], this stops compiling. Never
// called; it exists only to be type-checked (that's the whole point of tRPC's
// type-only export).
export async function _tasksListReturnsTaskArray(): Promise<Task[]> {
  const client = createClient({ url: "http://localhost:3001/api/trpc" })
  return client.tasks.list.query()
}
