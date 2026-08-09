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

  // id + timestamps are DB-generated here (server-minted uuid); moving the mint
  // to the client is an M11 change.
  create: protectedProcedure.input(newTaskSchema).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .insert(tasks)
      .values({
        userId: ctx.userId,
        title: input.title,
        description: input.description,
        completed: input.completed,
      })
      .returning()
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" })
    return toTask(row)
  }),

  update: protectedProcedure.input(updateTaskSchema).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const [row] = await ctx.db
      .update(tasks)
      .set(fields)
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
