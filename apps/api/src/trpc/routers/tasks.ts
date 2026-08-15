import { TRPCError } from "@trpc/server"
import { and, desc, eq, isNull } from "drizzle-orm"
import { tasks } from "../../db/tasks"
import { newTaskSchema, type Task, taskIdSchema, updateTaskSchema } from "../../domain"
import { protectedProcedure, router } from "../init"

// Map a DB row to the wire/domain Task: drop the DB-only `userId`, and convert
// the timestamptz Dates to ISO strings so the shape matches @pace/validation's
// taskSchema. This mapper is also where any DB↔domain drift surfaces — as a
// type error on the returned object.
function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: row.completed,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    startHasTime: row.startHasTime,
    dueHasTime: row.dueHasTime,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  }
}

// Every query is scoped to ctx.userId, so a user only ever touches their own
// tasks — ownership is enforced in the WHERE clause, not trusted from input.
export const tasksRouter = router({
  // Reads exclude tombstones: soft-deleted rows stay in the table (sync needs
  // them) but never surface. This habit starts with the very first query.
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt))
    return rows.map(toTask)
  }),

  // The client may mint the id (PowerSync offline creates); fall back to the DB
  // default when it's absent. Timestamps stay server-owned.
  //
  // When an id is supplied we upsert: PowerSync retries an upload whose ack was
  // lost, so a plain insert would hit a duplicate-key error on the retry. The
  // setWhere scopes the conflict update to the owner, so a guessed id can never
  // overwrite another user's row.
  //
  // The conflict update also clears `deletedAt`: re-creating a soft-deleted task
  // (same id) un-tombstones it. That's what powers Undo — the client re-inserts a
  // just-deleted task locally, which replays as a create and restores the row.
  create: protectedProcedure.input(newTaskSchema).mutation(async ({ ctx, input }) => {
    // Wire dates are ISO strings; the timestamptz columns want Date | null.
    const startDate = input.startDate ? new Date(input.startDate) : null
    const dueDate = input.dueDate ? new Date(input.dueDate) : null
    const values = {
      userId: ctx.userId,
      title: input.title,
      description: input.description,
      completed: input.completed,
      startDate,
      dueDate,
      startHasTime: input.startHasTime ?? false,
      dueHasTime: input.dueHasTime ?? false,
    }
    const [row] = input.id
      ? await ctx.db
          .insert(tasks)
          .values({ id: input.id, ...values })
          .onConflictDoUpdate({
            target: tasks.id,
            set: {
              title: input.title,
              description: input.description,
              completed: input.completed,
              startDate,
              dueDate,
              startHasTime: input.startHasTime ?? false,
              dueHasTime: input.dueHasTime ?? false,
              deletedAt: null,
            },
            setWhere: eq(tasks.userId, ctx.userId),
          })
          .returning()
      : await ctx.db.insert(tasks).values(values).returning()
    if (!row) throw new TRPCError({ code: "CONFLICT" })
    return toTask(row)
  }),

  update: protectedProcedure.input(updateTaskSchema).mutation(async ({ ctx, input }) => {
    const { id, startDate, dueDate, ...fields } = input
    const [row] = await ctx.db
      .update(tasks)
      .set({
        ...fields,
        // Convert ISO → Date only when the field was sent; omit = unchanged,
        // explicit null = clear the date.
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
