import { TRPCError } from "@trpc/server"
import { and, eq, isNull } from "drizzle-orm"
import { tags, taskTags } from "../../db/tags"
import { tasks } from "../../db/tasks"
import {
  newTagSchema,
  reorderSchema,
  tagIdSchema,
  taskTagSchema,
  updateTagSchema,
} from "../../domain"
import { protectedProcedure, router } from "../init"

// Tags (P2-04): a flat user-scoped library (create/update/reorder/softDelete) plus the
// task↔tag join (assign/unassign). All protectedProcedure, scoped to ctx.userId. Creates
// are client-mintable upserts (like statuses). The join's id is deterministic and
// server-set, so an assign is idempotent and offline-conflict-free.

// The deterministic link id — the client mints the same one, so writes converge.
const linkId = (taskId: string, tagId: string) => `${taskId}_${tagId}`

export const tagsRouter = router({
  create: protectedProcedure.input(newTagSchema).mutation(async ({ ctx, input }) => {
    const values = {
      userId: ctx.userId,
      name: input.name,
      color: input.color,
      position: input.position ?? 0,
    }
    const [row] = input.id
      ? await ctx.db
          .insert(tags)
          .values({ id: input.id, ...values })
          .onConflictDoUpdate({
            target: tags.id,
            set: { name: input.name, color: input.color, deletedAt: null },
            setWhere: eq(tags.userId, ctx.userId),
          })
          .returning()
      : await ctx.db.insert(tags).values(values).returning()
    if (!row) throw new TRPCError({ code: "CONFLICT" })
    return row.id
  }),

  update: protectedProcedure.input(updateTagSchema).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const [row] = await ctx.db
      .update(tags)
      .set(fields)
      .where(and(eq(tags.id, id), eq(tags.userId, ctx.userId), isNull(tags.deletedAt)))
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return row.id
  }),

  reorder: protectedProcedure.input(reorderSchema).mutation(async ({ ctx, input }) => {
    await ctx.db.transaction(async (tx) => {
      for (let i = 0; i < input.ids.length; i++) {
        await tx
          .update(tags)
          .set({ position: i })
          .where(and(eq(tags.id, input.ids[i] as string), eq(tags.userId, ctx.userId)))
      }
    })
  }),

  softDelete: protectedProcedure.input(tagIdSchema).mutation(async ({ ctx, input }) => {
    // Soft-delete the tag AND hard-delete its links — a link has no independent lifecycle,
    // so nothing dangling stays in the sync stream.
    await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(tags)
        .set({ deletedAt: new Date() })
        .where(and(eq(tags.id, input.id), eq(tags.userId, ctx.userId), isNull(tags.deletedAt)))
        .returning()
      if (!row) throw new TRPCError({ code: "NOT_FOUND" })
      await tx
        .delete(taskTags)
        .where(and(eq(taskTags.tagId, input.id), eq(taskTags.userId, ctx.userId)))
    })
    return input.id
  }),

  assign: protectedProcedure.input(taskTagSchema).mutation(async ({ ctx, input }) => {
    // Both the task and the tag must be the user's live rows.
    const [task] = await ctx.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
    if (!task) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown task" })
    const [tag] = await ctx.db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.id, input.tagId), eq(tags.userId, ctx.userId), isNull(tags.deletedAt)))
    if (!tag) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown tag" })

    await ctx.db
      .insert(taskTags)
      .values({
        id: linkId(input.taskId, input.tagId),
        taskId: input.taskId,
        tagId: input.tagId,
        userId: ctx.userId,
      })
      .onConflictDoNothing()
  }),

  unassign: protectedProcedure.input(taskTagSchema).mutation(async ({ ctx, input }) => {
    await ctx.db
      .delete(taskTags)
      .where(
        and(eq(taskTags.id, linkId(input.taskId, input.tagId)), eq(taskTags.userId, ctx.userId)),
      )
  }),
})
