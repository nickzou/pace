import { TRPCError } from "@trpc/server"
import { and, eq, isNull, ne } from "drizzle-orm"
import { statuses, statusGroups, userSettings } from "../../db/statuses"
import { tasks } from "../../db/tasks"
import {
  newStatusGroupSchema,
  newStatusSchema,
  statusIdSchema,
  updateStatusGroupSchema,
  updateStatusSchema,
  updateUserSettingsSchema,
} from "../../domain"
import type { Context } from "../context"
import { protectedProcedure, router } from "../init"

type StatusCategory = "open" | "in_progress" | "done"
type ProtectedCtx = { db: Context["db"]; userId: string }

// A status the user owns, live (not tombstoned). Rejects anything else.
async function ownedStatus(ctx: ProtectedCtx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, id), eq(statuses.userId, ctx.userId), isNull(statuses.deletedAt)))
  if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown status" })
  return row
}

// A live status the user owns in `groupId`, preferring `category`, else any — the target
// tasks are reassigned to when their status is deleted.
async function fallbackStatus(
  ctx: ProtectedCtx,
  groupId: string,
  category: StatusCategory,
  excludeId: string,
): Promise<string> {
  const rows = await ctx.db
    .select({ id: statuses.id, category: statuses.category })
    .from(statuses)
    .where(
      and(
        eq(statuses.groupId, groupId),
        eq(statuses.userId, ctx.userId),
        isNull(statuses.deletedAt),
        ne(statuses.id, excludeId),
      ),
    )
    .orderBy(statuses.position)
  const target =
    rows.find((r) => r.category === category) ?? rows.find((r) => r.category === "open") ?? rows[0]
  if (!target)
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Group has no other status" })
  return target.id
}

// Groups (status lists). create upserts (client-mintable id); softDelete protects the
// default group and reassigns its tasks.
const groups = router({
  create: protectedProcedure.input(newStatusGroupSchema).mutation(async ({ ctx, input }) => {
    const values = { userId: ctx.userId, name: input.name, position: input.position ?? 0 }
    const [row] = input.id
      ? await ctx.db
          .insert(statusGroups)
          .values({ id: input.id, ...values })
          .onConflictDoUpdate({
            target: statusGroups.id,
            set: { name: input.name, deletedAt: null },
            setWhere: eq(statusGroups.userId, ctx.userId),
          })
          .returning()
      : await ctx.db.insert(statusGroups).values(values).returning()
    if (!row) throw new TRPCError({ code: "CONFLICT" })
    return row.id
  }),

  update: protectedProcedure.input(updateStatusGroupSchema).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const [row] = await ctx.db
      .update(statusGroups)
      .set(fields)
      .where(
        and(
          eq(statusGroups.id, id),
          eq(statusGroups.userId, ctx.userId),
          isNull(statusGroups.deletedAt),
        ),
      )
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return row.id
  }),

  softDelete: protectedProcedure.input(statusIdSchema).mutation(async ({ ctx, input }) => {
    const [group] = await ctx.db
      .select()
      .from(statusGroups)
      .where(
        and(
          eq(statusGroups.id, input.id),
          eq(statusGroups.userId, ctx.userId),
          isNull(statusGroups.deletedAt),
        ),
      )
    if (!group) throw new TRPCError({ code: "NOT_FOUND" })
    if (group.isDefault)
      throw new TRPCError({ code: "FORBIDDEN", message: "Can't delete the default group" })

    // Reassign this group's tasks to the default group's first open status, then tombstone
    // the group and its statuses.
    const [target] = await ctx.db
      .select({ id: statuses.id })
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
    if (!target)
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No default open status" })

    await ctx.db.transaction(async (tx) => {
      const groupStatuses = await tx
        .select({ id: statuses.id })
        .from(statuses)
        .where(and(eq(statuses.groupId, input.id), eq(statuses.userId, ctx.userId)))
      const ids = groupStatuses.map((s) => s.id)
      if (ids.length > 0) {
        for (const sid of ids) {
          await tx
            .update(tasks)
            .set({ statusId: target.id, resolvedAt: null })
            .where(and(eq(tasks.statusId, sid), eq(tasks.userId, ctx.userId)))
        }
      }
      const now = new Date()
      await tx.update(statuses).set({ deletedAt: now }).where(eq(statuses.groupId, input.id))
      await tx.update(statusGroups).set({ deletedAt: now }).where(eq(statusGroups.id, input.id))
    })
    return input.id
  }),
})

// Individual statuses. softDelete protects the seeded (is_system) rows, keeps every group
// with ≥1 open and ≥1 done, and reassigns any tasks using the deleted status.
const items = router({
  create: protectedProcedure.input(newStatusSchema).mutation(async ({ ctx, input }) => {
    // The group must be the user's.
    const [group] = await ctx.db
      .select({ id: statusGroups.id })
      .from(statusGroups)
      .where(
        and(
          eq(statusGroups.id, input.groupId),
          eq(statusGroups.userId, ctx.userId),
          isNull(statusGroups.deletedAt),
        ),
      )
    if (!group) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown group" })

    const values = {
      userId: ctx.userId,
      groupId: input.groupId,
      name: input.name,
      color: input.color,
      category: input.category,
      position: input.position ?? 0,
    }
    const [row] = input.id
      ? await ctx.db
          .insert(statuses)
          .values({ id: input.id, ...values })
          .onConflictDoUpdate({
            target: statuses.id,
            set: {
              name: input.name,
              color: input.color,
              category: input.category,
              deletedAt: null,
            },
            setWhere: eq(statuses.userId, ctx.userId),
          })
          .returning()
      : await ctx.db.insert(statuses).values(values).returning()
    if (!row) throw new TRPCError({ code: "CONFLICT" })
    return row.id
  }),

  update: protectedProcedure.input(updateStatusSchema).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input
    const [row] = await ctx.db
      .update(statuses)
      .set(fields)
      .where(and(eq(statuses.id, id), eq(statuses.userId, ctx.userId), isNull(statuses.deletedAt)))
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return row.id
  }),

  softDelete: protectedProcedure.input(statusIdSchema).mutation(async ({ ctx, input }) => {
    const status = await ownedStatus(ctx, input.id)
    if (status.isSystem)
      throw new TRPCError({ code: "FORBIDDEN", message: "Can't delete a system status" })

    // The group must keep ≥1 open and ≥1 done. Block if this is the last of its kind and
    // it's an open/done status.
    if (status.category === "open" || status.category === "done") {
      const [remaining] = await ctx.db
        .select({ id: statuses.id })
        .from(statuses)
        .where(
          and(
            eq(statuses.groupId, status.groupId),
            eq(statuses.userId, ctx.userId),
            eq(statuses.category, status.category),
            isNull(statuses.deletedAt),
            ne(statuses.id, status.id),
          ),
        )
        .limit(1)
      if (!remaining)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `A group must keep at least one ${status.category} status`,
        })
    }

    const targetId = await fallbackStatus(ctx, status.groupId, status.category, status.id)
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(tasks)
        .set({ statusId: targetId, resolvedAt: null })
        .where(and(eq(tasks.statusId, status.id), eq(tasks.userId, ctx.userId)))
      await tx.update(statuses).set({ deletedAt: new Date() }).where(eq(statuses.id, status.id))
    })
    return input.id
  }),
})

// The single per-user settings row (the enable toggle). Upsert.
const settings = router({
  set: protectedProcedure.input(updateUserSettingsSchema).mutation(async ({ ctx, input }) => {
    if (input.customStatusesEnabled === undefined) return
    await ctx.db
      .insert(userSettings)
      .values({ userId: ctx.userId, customStatusesEnabled: input.customStatusesEnabled })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { customStatusesEnabled: input.customStatusesEnabled },
      })
  }),
})

export const statusesRouter = router({ groups, items, settings })
