import { randomUUID } from "node:crypto"
import { advanceSchedule, isValidRule } from "@pace/validation/recurrence"
import { TRPCError } from "@trpc/server"
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { generateKeyBetween } from "fractional-indexing"
import { statuses, statusGroups, userSettings } from "../../db/statuses"
import { taskTags } from "../../db/tags"
import { tasks } from "../../db/tasks"
import {
  newTaskSchema,
  type Regen,
  setParentSchema,
  setRecurrenceSchema,
  type Task,
  taskIdSchema,
  updateTaskSchema,
} from "../../domain"
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
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    // Free text in the DB; only ever written through the validated setRecurrence path (P2-08),
    // so the regen mode is safely one of the enum values (or null when not repeating).
    recurrence: row.recurrence,
    recurrenceRegen: row.recurrenceRegen as Regen | null,
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

// A fractional key that sorts *after* every live task in the sibling scope (P2-06) — i.e.
// the bottom of that list. Used when a create omits a key (a non-PowerSync caller, or the
// server-authoritative path) and when a re-parent moves a task into a new scope. The `""`
// default (pre-backfill / non-blocking ADD COLUMN) is treated as "no key" so it can never
// poison generateKeyBetween. A user's sibling set is human-scale, so max() over the index
// is cheap.
async function bottomOfScopeKey(ctx: ProtectedCtx, parentId: string | null): Promise<string> {
  const [row] = await ctx.db
    .select({ max: sql<string | null>`max(${tasks.sortOrder})` })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, ctx.userId),
        parentId === null ? isNull(tasks.parentId) : eq(tasks.parentId, parentId),
        isNull(tasks.deletedAt),
      ),
    )
  const max = row?.max && row.max !== "" ? row.max : null
  return generateKeyBetween(max, null)
}

// The user's IANA timezone for recurrence math (P2-08). Falls back to UTC before the client has
// auto-detected one — a repeating task needs a due date and is set from the loaded app (autodetect
// has run by then), so a null zone is an edge; UTC keeps generation deterministic.
async function userTimezone(ctx: ProtectedCtx): Promise<string> {
  const [row] = await ctx.db
    .select({ tz: userSettings.timezone })
    .from(userSettings)
    .where(eq(userSettings.userId, ctx.userId))
  return row?.tz ?? "UTC"
}

// Copy a task's tag links onto another task (P2-08 'duplicate' regen carries tags forward).
async function copyTaskTags(ctx: ProtectedCtx, fromId: string, toId: string): Promise<void> {
  const links = await ctx.db
    .select({ tagId: taskTags.tagId })
    .from(taskTags)
    .where(and(eq(taskTags.taskId, fromId), eq(taskTags.userId, ctx.userId)))
  if (links.length === 0) return
  await ctx.db
    .insert(taskTags)
    .values(
      links.map((l) => ({ id: randomUUID(), taskId: toId, tagId: l.tagId, userId: ctx.userId })),
    )
}

// The subtask nesting ceiling (P2-05). Top-level is level 1.
const MAX_DEPTH = 5

// Guard a parent assignment. The new parent must be the user's live task; the move must not
// make a task its own parent, create a cycle (the child can't be an ancestor of the new
// parent), or push any node past MAX_DEPTH — measured against the child's *whole subtree
// height*, not just the child, so a deep descendant can't be shoved over the limit. Called
// for both `create` (a not-yet-existing child has height 1) and `setParent`. Every walk is
// bounded by MAX_DEPTH, so this stays a handful of cheap indexed reads. Throws BAD_REQUEST.
async function assertCanParent(
  ctx: ProtectedCtx,
  childId: string | null,
  parentId: string,
): Promise<void> {
  if (childId !== null && parentId === childId)
    throw new TRPCError({ code: "BAD_REQUEST", message: "A task can't be its own parent" })

  // Walk up from the parent to its root: counts the parent's depth (levels to root) and, if
  // it ever reaches the child, flags a cycle (the child is an ancestor of the new parent).
  let depth = 0
  let cursor: string | null = parentId
  while (cursor) {
    if (childId !== null && cursor === childId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Can't move a task under its own descendant",
      })
    const [row]: { parentId: string | null }[] = await ctx.db
      .select({ parentId: tasks.parentId })
      .from(tasks)
      .where(and(eq(tasks.id, cursor), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
    if (!row) {
      if (depth === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown parent task" })
      break // a broken chain above the parent; the parent itself is valid
    }
    depth += 1
    cursor = row.parentId
    if (depth > MAX_DEPTH) break // safety valve; a well-formed tree never gets here
  }

  // Walk down from the child level-by-level to find its subtree height. A null child (a
  // not-yet-created task) has no descendants, so height is 1 and the walk is skipped. Capped
  // at MAX_DEPTH — a height that reaches the cap already fails the check below.
  let height = 1
  let frontier = childId === null ? [] : [childId]
  while (frontier.length && height < MAX_DEPTH) {
    const children = await ctx.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          inArray(tasks.parentId, frontier),
          eq(tasks.userId, ctx.userId),
          isNull(tasks.deletedAt),
        ),
      )
    if (children.length === 0) break
    height += 1
    frontier = children.map((c) => c.id)
  }

  if (depth + height > MAX_DEPTH)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Subtasks can nest at most ${MAX_DEPTH} levels deep`,
    })
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
      // Manual order (P2-06): the fractional key, with id as a stable tie-break so the
      // order is total and identical on every device even after an offline key collision.
      .orderBy(asc(tasks.sortOrder), asc(tasks.id))
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
    // A subtask (parentId set) must pass the depth/cycle guard. A not-yet-created task has
    // no descendants, so this reduces to "parent is live and depth(parent) + 1 ≤ 5". Skipped
    // for a top-level task and for a re-create that promotes to top-level (parentId null).
    if (input.parentId != null) await assertCanParent(ctx, input.id ?? null, input.parentId)
    const status = input.statusId
      ? { id: input.statusId, category: await categoryOf(ctx, input.statusId) }
      : await defaultStatus(ctx)
    const startDate = input.startDate ? new Date(input.startDate) : null
    const dueDate = input.dueDate ? new Date(input.dueDate) : null
    const resolvedInsert = status.category === "done" ? new Date() : null
    const resolvedUpsert =
      status.category === "done" ? sql`coalesce(${tasks.resolvedAt}, now())` : null
    // Ordering (P2-06): PowerSync clients mint the key locally (offline creates), so a supplied
    // key is honoured; a non-PowerSync caller that omits it lands at the bottom of its scope.
    const sortOrder = input.sortOrder ?? (await bottomOfScopeKey(ctx, input.parentId ?? null))

    const shared = {
      title: input.title,
      description: input.description,
      statusId: status.id,
      startDate,
      dueDate,
      startHasTime: input.startHasTime ?? false,
      dueHasTime: input.dueHasTime ?? false,
    }
    // parentId rides both the insert and the conflict update so an undo re-create restores a
    // subtask's place in the tree. Only touched on upsert when explicitly sent (undefined =
    // leave as-is), so a plain re-create never silently re-parents.
    const parentPatch = input.parentId !== undefined ? { parentId: input.parentId } : {}
    // sortOrder likewise: an undo re-create carries the original key (restoring the task to its
    // place); a plain re-create leaves the existing key untouched — never reshuffles the list.
    const sortPatch = input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}
    const [row] = input.id
      ? await ctx.db
          .insert(tasks)
          .values({
            id: input.id,
            userId: ctx.userId,
            resolvedAt: resolvedInsert,
            parentId: input.parentId ?? null,
            sortOrder,
            ...shared,
          })
          .onConflictDoUpdate({
            target: tasks.id,
            set: {
              ...shared,
              ...parentPatch,
              ...sortPatch,
              resolvedAt: resolvedUpsert,
              deletedAt: null,
            },
            setWhere: eq(tasks.userId, ctx.userId),
          })
          .returning()
      : await ctx.db
          .insert(tasks)
          .values({
            userId: ctx.userId,
            resolvedAt: resolvedInsert,
            parentId: input.parentId ?? null,
            sortOrder,
            ...shared,
          })
          .returning()
    if (!row) throw new TRPCError({ code: "CONFLICT" })
    return toTask(row)
  }),

  update: protectedProcedure.input(updateTaskSchema).mutation(async ({ ctx, input }) => {
    const { id, statusId, startDate, dueDate, ...fields } = input

    // A status change re-derives resolved_at: entering `done` stamps it (COALESCE keeps the first
    // time); anything else clears it. And completing a *repeating* task (P2-08) fires generation —
    // but only on the non-done → done edge, so we read the prior state just for that case.
    let statusPatch: Record<string, unknown> = {}
    let completed: { rule: string; regen: Regen; dueDate: Date; startDate: Date | null } | null =
      null
    if (statusId !== undefined) {
      const newCategory = await categoryOf(ctx, statusId)
      statusPatch = {
        statusId,
        resolvedAt: newCategory === "done" ? sql`coalesce(${tasks.resolvedAt}, now())` : null,
      }
      if (newCategory === "done") {
        const [cur] = await ctx.db
          .select({
            statusId: tasks.statusId,
            recurrence: tasks.recurrence,
            recurrenceRegen: tasks.recurrenceRegen,
            dueDate: tasks.dueDate,
            startDate: tasks.startDate,
          })
          .from(tasks)
          .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
        // Fire only when a rule + due exist AND the task wasn't already done (no double-generation
        // on a re-synced/duplicated completion op).
        if (cur?.recurrence && cur.dueDate && (await categoryOf(ctx, cur.statusId)) !== "done") {
          completed = {
            rule: cur.recurrence,
            regen: (cur.recurrenceRegen ?? "advance") as Regen,
            dueDate: cur.dueDate,
            startDate: cur.startDate,
          }
        }
      }
    }

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

    // A repeating task just completed → generate its next occurrence (P2-08 §5).
    if (completed) {
      const tz = await userTimezone(ctx)
      const next = advanceSchedule(
        completed.rule,
        completed.dueDate.toISOString(),
        completed.startDate?.toISOString() ?? null,
        tz,
      )
      if (next) {
        const open = await defaultStatus(ctx)
        if (completed.regen === "advance") {
          // Reschedule THIS task forward and reopen it — the one task lives on.
          const [reopened] = await ctx.db
            .update(tasks)
            .set({
              statusId: open.id,
              resolvedAt: null,
              dueDate: new Date(next.dueIso),
              startDate: next.startIso ? new Date(next.startIso) : null,
            })
            .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.userId)))
            .returning()
          return toTask(reopened ?? row)
        }
        // 'duplicate': the completed task keeps its done state but loses the rule (a finished
        // instance); a fresh open task carries the rule + tags to the next occurrence.
        await ctx.db
          .update(tasks)
          .set({ recurrence: null, recurrenceRegen: null })
          .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.userId)))
        const sortOrder = await bottomOfScopeKey(ctx, row.parentId)
        const [fresh] = await ctx.db
          .insert(tasks)
          .values({
            userId: ctx.userId,
            title: row.title,
            description: row.description,
            statusId: open.id,
            dueDate: new Date(next.dueIso),
            startDate: next.startIso ? new Date(next.startIso) : null,
            startHasTime: row.startHasTime,
            dueHasTime: row.dueHasTime,
            parentId: row.parentId,
            sortOrder,
            recurrence: completed.rule,
            recurrenceRegen: completed.regen,
          })
          .returning()
        if (fresh) await copyTaskTags(ctx, id, fresh.id)
        // Return the original (completed) task the client's update targeted; the new task and this
        // one's cleared rule arrive via the sync stream.
        return toTask({ ...row, recurrence: null, recurrenceRegen: null })
      }
      // Rule exhausted (past COUNT/UNTIL) → the completion simply stands.
    }
    return toTask(row)
  }),

  // Set (or clear) a task's recurrence (P2-08). Isolated like setParent so the connector maps a
  // clean op and the guards live in one place: the rule must parse, carry a regen mode, and the
  // task must have a due date to anchor the schedule to. `recurrence: null` stops repeating.
  setRecurrence: protectedProcedure.input(setRecurrenceSchema).mutation(async ({ ctx, input }) => {
    if (input.recurrence !== null) {
      if (!isValidRule(input.recurrence))
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid recurrence rule" })
      if (input.recurrenceRegen === null)
        throw new TRPCError({ code: "BAD_REQUEST", message: "A recurring task needs a regen mode" })
      const [t] = await ctx.db
        .select({ dueDate: tasks.dueDate })
        .from(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
      if (!t) throw new TRPCError({ code: "NOT_FOUND" })
      if (!t.dueDate)
        throw new TRPCError({ code: "BAD_REQUEST", message: "A repeating task needs a due date" })
    }
    const [row] = await ctx.db
      .update(tasks)
      .set({ recurrence: input.recurrence, recurrenceRegen: input.recurrenceRegen })
      .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return toTask(row)
  }),

  // Re-parent a task (P2-05), or promote it to top-level with parentId = null. A non-null
  // parent runs the depth/cycle guard; null always passes. Ownership is enforced in the
  // WHERE. Parent moves have their own procedure (not `update`) so the guard has one home.
  setParent: protectedProcedure.input(setParentSchema).mutation(async ({ ctx, input }) => {
    if (input.parentId != null) await assertCanParent(ctx, input.id, input.parentId)
    // Re-stamp a bottom-of-scope key (P2-06): the task's old key was ordered within its former
    // sibling set and is meaningless in the new one, so drop it at the end of the new scope.
    const sortOrder = await bottomOfScopeKey(ctx, input.parentId)
    const [row] = await ctx.db
      .update(tasks)
      .set({ parentId: input.parentId, sortOrder })
      .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
      .returning()
    if (!row) throw new TRPCError({ code: "NOT_FOUND" })
    return toTask(row)
  }),

  // Soft delete: stamp deletedAt, don't remove the row — and cascade to the whole subtree so
  // a subtask never outlives its parent in the sync stream. The subtree is gathered
  // level-by-level (bounded by MAX_DEPTH) and tombstoned in one update. The client captures
  // the subtree locally for Undo (which re-creates it top-down, un-tombstoning each row).
  softDelete: protectedProcedure.input(taskIdSchema).mutation(async ({ ctx, input }) => {
    const ids = [input.id]
    let frontier = [input.id]
    while (frontier.length) {
      const children = await ctx.db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            inArray(tasks.parentId, frontier),
            eq(tasks.userId, ctx.userId),
            isNull(tasks.deletedAt),
          ),
        )
      if (children.length === 0) break
      const childIds = children.map((c) => c.id)
      ids.push(...childIds)
      frontier = childIds
    }
    const rows = await ctx.db
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(inArray(tasks.id, ids), eq(tasks.userId, ctx.userId), isNull(tasks.deletedAt)))
      .returning()
    const target = rows.find((r) => r.id === input.id)
    if (!target) throw new TRPCError({ code: "NOT_FOUND" })
    return toTask(target)
  }),
})
