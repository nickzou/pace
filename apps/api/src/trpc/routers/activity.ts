import { TRPCError } from "@trpc/server"
import { and, desc, eq, lt } from "drizzle-orm"
import { taskActivity } from "../../db/activity"
import { tasks } from "../../db/tasks"
import { newTaskActivitySchema, type TaskActivity, taskActivityQuerySchema } from "../../domain"
import { protectedProcedure, router } from "../init"

// Map a DB row to the wire/domain TaskActivity: drop the DB-only `userId`, and convert the
// timestamptz Dates to ISO strings. `action`/`meta` already carry their domain types (pgEnum
// + jsonb `$type<ActivityMeta>`), so this mapper is where any DB↔domain drift surfaces.
function toActivity(row: typeof taskActivity.$inferSelect): TaskActivity {
  return {
    id: row.id,
    taskId: row.taskId,
    action: row.action,
    field: row.field,
    fromValue: row.fromValue,
    toValue: row.toValue,
    meta: row.meta ?? null,
    createdAt: row.createdAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
  }
}

// Task activity history (P3-08). An APPEND-ONLY, user-scoped audit trail — so this router has
// only `create` (insert) and `list` (read). There is deliberately no update or delete: a task
// being deleted/restored is itself just another entry, never a mutation of history.
export const activityRouter = router({
  // Append one entry. Authored on the client (client-minted id + client `createdAt`), replayed
  // up by the connector. Idempotent: a replayed upload whose ack was lost hits the existing id
  // and is a no-op (rows are immutable, so we never overwrite). `recordedAt` is server-owned.
  create: protectedProcedure.input(newTaskActivitySchema).mutation(async ({ ctx, input }) => {
    // Ownership: the entry must attach to the user's own task. No deletedAt filter — a
    // `deleted`/`restored` entry legitimately references a soft-deleted task.
    const [owned] = await ctx.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.userId)))
    if (!owned) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown task" })

    const [row] = await ctx.db
      .insert(taskActivity)
      .values({
        ...(input.id ? { id: input.id } : {}),
        userId: ctx.userId,
        taskId: input.taskId,
        action: input.action,
        field: input.field ?? null,
        fromValue: input.fromValue ?? null,
        toValue: input.toValue ?? null,
        meta: input.meta ?? null,
        // Client-authored time (when the change happened); server default now() if omitted.
        ...(input.createdAt ? { createdAt: new Date(input.createdAt) } : {}),
        // recordedAt is left to the DB default (server upload time).
      })
      // Immutable: on a duplicate id, keep the original row untouched.
      .onConflictDoNothing({ target: taskActivity.id })
      .returning()
    if (row) return toActivity(row)

    // Conflict (replayed op): return the row that's already stored.
    const [existing] = await ctx.db
      .select()
      .from(taskActivity)
      .where(and(eq(taskActivity.id, String(input.id)), eq(taskActivity.userId, ctx.userId)))
    if (!existing) throw new TRPCError({ code: "CONFLICT" })
    return toActivity(existing)
  }),

  // Read a task's history, newest-first. The clients read local SQLite directly; this is the
  // seam the REST API (P3-10) and analytics use. Keyset-paginated on createdAt via `before`.
  list: protectedProcedure.input(taskActivityQuerySchema).query(async ({ ctx, input }) => {
    const where = [eq(taskActivity.userId, ctx.userId), eq(taskActivity.taskId, input.taskId)]
    if (input.before) where.push(lt(taskActivity.createdAt, new Date(input.before)))
    const rows = await ctx.db
      .select()
      .from(taskActivity)
      .where(and(...where))
      // id as a stable tie-break so the order is total even when two entries share a timestamp.
      .orderBy(desc(taskActivity.createdAt), desc(taskActivity.id))
      .limit(input.limit ?? 50)
    return rows.map(toActivity)
  }),
})
