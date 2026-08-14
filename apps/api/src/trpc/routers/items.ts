import { TRPCError } from "@trpc/server"
import { and, desc, eq, isNull } from "drizzle-orm"
import { items } from "../../db/items"
import { newItemSchema, type Item, itemIdSchema, updateItemSchema } from "../../domain"
import { protectedProcedure, router } from "../init"

// Map a DB row to the wire/domain Item: drop the DB-only `userId`, and convert
// the timestamptz Dates to ISO strings so the shape matches @pace/validation's
// itemSchema. This mapper is also where any DB↔domain drift surfaces — as a
// type error on the returned object.
function toItem(row: typeof items.$inferSelect): Item {
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
// items — ownership is enforced in the WHERE clause, not trusted from input.
export const itemsRouter = router({
  // Reads exclude tombstones: soft-deleted rows stay in the table (sync needs
  // them) but never surface. This habit starts with the very first query.
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(items)
      .where(and(eq(items.userId, ctx.userId), isNull(items.deletedAt)))
      .orderBy(desc(items.createdAt))
    return rows.map(toItem)
  }),

  // The client may mint the id (PowerSync offline creates); fall back to the DB
  // default when it's absent. Timestamps stay server-owned.
  //
  // When an id is supplied we upsert: PowerSync retries an upload whose ack was
  // lost, so a plain insert would hit a duplicate-key error on the retry. The
  // setWhere scopes the conflict update to the owner, so a guessed id can never
  // overwrite another user's row.
  create: protectedProcedure.input(newItemSchema).mutation(async ({ ctx, input }) => {
    const values = {
      userId: ctx.userId,
      title: input.title,
      description: input.description,
      completed: input.completed,
    }
    const [row] = input.id
      ? await ctx.db
          .insert(items)
          .values({ id: input.id, ...values })
          .onConflictDoUpdate({
            target: items.id,
            set: { title: input.title, description: input.description, completed: input.completed },
            setWhere: eq(items.userId, ctx.userId),
          })
          .returning()
      : await ctx.db.insert(items).values(values).returning()
    if (!row) throw new TRPCError({ code: "CONFLICT" })
    return toItem(row)
  }),

  update: protectedProcedure.input(updateItemSchema).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const [row] = await ctx.db
      .update(items)
      .set(fields)
      .where(and(eq(items.id, id), eq(items.userId, ctx.userId), isNull(items.deletedAt)))
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return toItem(row)
  }),

  // Soft delete: stamp deletedAt, don't remove the row.
  softDelete: protectedProcedure.input(itemIdSchema).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .update(items)
      .set({ deletedAt: new Date() })
      .where(and(eq(items.id, input.id), eq(items.userId, ctx.userId), isNull(items.deletedAt)))
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return toItem(row)
  }),
})
