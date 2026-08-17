import { TRPCError } from "@trpc/server"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { statuses, statusGroups } from "../../db/statuses"
import { tasks } from "../../db/tasks"
import { newTaskSchema, type Task, taskIdSchema, updateTaskSchema } from "../../domain"
import type { Context } from "../context"
import { protectedProcedure, router } from "../init"

type StatusCategory = "open" | "in_progress" | "done"
// The context inside a protectedProcedure — userId is guaranteed non-null there.
type ProtectedCtx = { db: Context["db"]; userId: string }

// Map a DB row to the wire/domain Task: drop the DB-only `userId`/`completed`, and
// convert the timestamptz Dates to ISO strings so the shape matches @pace/validation's
// taskSchema. This mapper is also where any DB↔domain drift surfaces — as a type error.
function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    statusId: row.statusId,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    startHasTime: row.startHasTime,
    dueHasTime: row.dueHasTime,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }
}

// Resolve a status the user OWNS → its category. Rejects a status that isn't theirs
// (or doesn't exist), so a task can never reference another user's status.
async function categoryOf(ctx: ProtectedCtx, statusId: string): Promise<StatusCategory> {
  const [row] = await ctx.db
    .select({ category: statuses.category })
    .from(statuses)
    .where(
      and(eq(statuses.id, statusId), eq(statuses.userId, ctx.userId), isNull(statuses.deletedAt)),
    )
  if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown status" })
  return row.category
}

// The user's default open status (their default group's seeded "To Do") — assigned when
// a task is created without an explicit status.
async function defaultStatus(ctx: ProtectedCtx): Promise<{ id: string; category: StatusCategory }> {
  const [row] = await ctx.db
    .select({ id: statuses.id, category: statuses.category })
    .from(statuses)
    .innerJoin(statusGroups, eq(statuses.groupId, statusGroups.id))
    .where(
      and(
        eq(statuses.userId, ctx.userId),
        eq(statusGroups.isDefault, true),
        eq(statuses.category, "open"),
        isNull(statuses.deletedAt),
      ),
    )
    .orderBy(statuses.position)
    .limit(1)
  if (!row)
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "User has no default status" })
  return row
}

// Every query is scoped to ctx.userId, so a user only ever touches their own tasks —
// ownership is enforced in the WHERE clause, not trusted from input.
export const tasksRouter = router({
  // Reads exclude tombstones: soft-deleted rows stay in the table (sync needs them) but
  // never surface.
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt))
    return rows.map(toTask)
  }),

  // The client may mint the id (PowerSync offline creates); fall back to the DB default
  // when absent. A supplied id upserts (a retried upload whose ack was lost would else
  // hit a duplicate key); the setWhere scopes the conflict update to the owner. The
  // conflict update also clears `deletedAt` — re-creating a soft-deleted task un-tombstones
  // it, which is what powers Undo.
  //
  // Status: an omitted statusId gets the user's default open status. resolved_at is
  // server-owned — stamped when the status is `done` (COALESCE keeps the first time so a
  // re-create/undo doesn't move it).
  create: protectedProcedure.input(newTaskSchema).mutation(async ({ ctx, input }) => {
    const status = input.statusId
      ? { id: input.statusId, category: await categoryOf(ctx, input.statusId) }
      : await defaultStatus(ctx)
    const startDate = input.startDate ? new Date(input.startDate) : null
    const dueDate = input.dueDate ? new Date(input.dueDate) : null
    const resolvedInsert = status.category === "done" ? new Date() : null
    const resolvedUpsert =
      status.category === "done" ? sql`coalesce(${tasks.resolvedAt}, now())` : null

    const shared = {
      title: input.title,
      description: input.description,
      statusId: status.id,
      startDate,
      dueDate,
      startHasTime: input.startHasTime ?? false,
      dueHasTime: input.dueHasTime ?? false,
    }
    const [row] = input.id
      ? await ctx.db
          .insert(tasks)
          .values({ id: input.id, userId: ctx.userId, resolvedAt: resolvedInsert, ...shared })
          .onConflictDoUpdate({
            target: tasks.id,
            set: { ...shared, resolvedAt: resolvedUpsert, deletedAt: null },
            setWhere: eq(tasks.userId, ctx.userId),
          })
          .returning()
      : await ctx.db
          .insert(tasks)
          .values({ userId: ctx.userId, resolvedAt: resolvedInsert, ...shared })
          .returning()
    if (!row) throw new TRPCError({ code: "CONFLICT" })
    return toTask(row)
  }),

  update: protectedProcedure.input(updateTaskSchema).mutation(async ({ ctx, input }) => {
    const { id, statusId, startDate, dueDate, ...fields } = input
    // A status change re-derives resolved_at: entering `done` stamps it (COALESCE keeps
    // the first time); anything else clears it. Verify the status is the user's first.
    const statusPatch =
      statusId !== undefined
        ? {
            statusId,
            resolvedAt:
              (await categoryOf(ctx, statusId)) === "done"
                ? sql`coalesce(${tasks.resolvedAt}, now())`
                : null,
          }
        : {}
    const [row] = await ctx.db
      .update(tasks)
      .set({
        ...fields,
        ...statusPatch,
        // ISO → Date only when the field was sent; omit = unchanged, null = clear.
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      })
      .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return toTask(row)
  }),

  // Soft delete: stamp deletedAt, don't remove the row.
  softDelete: protectedProcedure.input(taskIdSchema).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return toTask(row)
  }),
})
