import type { useTRPCClient } from "@pace/api-client"
import type { StatusColor } from "@pace/tokens"
import { UpdateType } from "@powersync/web"

// The imperative tRPC client (from useTRPCClient) — the write path PowerSync replays
// local mutations through. No new backend: the same API the UI used, now driven by the
// sync engine.
export type TrpcClient = ReturnType<typeof useTRPCClient>
type StatusCategory = "open" | "in_progress" | "done"

// Map one local row op to the matching tRPC procedure. Split by table; each table's PUT
// (create — upserts on the client-minted id) / PATCH (partial update) / DELETE (soft
// delete) mirrors its router. resolved_at is server-owned, so we never upload it — the
// server derives it from the status category.
//
// Kept separate from the connector wiring (auth/transport) so this pure op→mutation mapping
// is unit-testable with a mocked client — see upload-op.test.ts.
export async function uploadOp(
  trpc: TrpcClient,
  table: string,
  type: UpdateType,
  id: string,
  data: Record<string, unknown>,
) {
  switch (table) {
    case "tasks":
      if (type === UpdateType.PUT) {
        await trpc.tasks.create.mutate({
          id,
          title: String(data.title ?? ""),
          description: String(data.description ?? ""),
          ...(data.status_id != null ? { statusId: String(data.status_id) } : {}),
          ...(data.start_date != null ? { startDate: String(data.start_date) } : {}),
          ...(data.due_date != null ? { dueDate: String(data.due_date) } : {}),
          ...(data.start_has_time != null ? { startHasTime: !!data.start_has_time } : {}),
          ...(data.due_has_time != null ? { dueHasTime: !!data.due_has_time } : {}),
          ...(data.parent_id != null ? { parentId: String(data.parent_id) } : {}),
          ...(data.sort_order != null ? { sortOrder: String(data.sort_order) } : {}),
        })
      } else if (type === UpdateType.PATCH) {
        // A re-parent is an isolated change to parent_id (setTaskParent writes only that
        // column), so it routes to the guarded setParent procedure — not the generic update,
        // which deliberately can't touch the hierarchy. null promotes to top-level.
        if (data.parent_id !== undefined) {
          await trpc.tasks.setParent.mutate({
            id,
            parentId: data.parent_id != null ? String(data.parent_id) : null,
          })
        } else if (data.recurrence !== undefined) {
          // Recurrence is an isolated write (setTaskRecurrence writes only these two columns) →
          // the guarded setRecurrence procedure, like setParent. null stops repeating.
          await trpc.tasks.setRecurrence.mutate({
            id,
            recurrence: data.recurrence != null ? String(data.recurrence) : null,
            recurrenceRegen:
              data.recurrence_regen != null
                ? (String(data.recurrence_regen) as "advance" | "duplicate")
                : null,
          })
        } else {
          const patch = {
            ...(data.title !== undefined ? { title: String(data.title) } : {}),
            ...(data.description !== undefined ? { description: String(data.description) } : {}),
            ...(data.status_id !== undefined ? { statusId: String(data.status_id) } : {}),
            ...(data.start_date !== undefined
              ? { startDate: data.start_date != null ? String(data.start_date) : null }
              : {}),
            ...(data.due_date !== undefined
              ? { dueDate: data.due_date != null ? String(data.due_date) : null }
              : {}),
            ...(data.start_has_time !== undefined ? { startHasTime: !!data.start_has_time } : {}),
            ...(data.due_has_time !== undefined ? { dueHasTime: !!data.due_has_time } : {}),
            // A reorder (P2-06) is an isolated sort_order write → the generic update carries it.
            ...(data.sort_order !== undefined ? { sortOrder: String(data.sort_order) } : {}),
          }
          // Every mutation bumps updated_at, and PowerSync's CRUD only records changed columns — so
          // re-setting a field to its current value yields an op whose only change is updated_at,
          // which maps to no server column. Skip it: sending an empty update makes the server throw
          // "No values to set" (a non-fatal 500) that would retry forever and stall the queue.
          if (Object.keys(patch).length > 0) await trpc.tasks.update.mutate({ id, ...patch })
        }
      } else {
        await trpc.tasks.softDelete.mutate({ id })
      }
      return

    case "status_groups":
      if (type === UpdateType.PUT) {
        await trpc.statuses.groups.create.mutate({
          id,
          name: String(data.name ?? ""),
          ...(data.position != null ? { position: Number(data.position) } : {}),
        })
      } else if (type === UpdateType.PATCH) {
        await trpc.statuses.groups.update.mutate({
          id,
          ...(data.name !== undefined ? { name: String(data.name) } : {}),
          ...(data.position !== undefined ? { position: Number(data.position) } : {}),
        })
      } else {
        await trpc.statuses.groups.softDelete.mutate({ id })
      }
      return

    case "statuses":
      if (type === UpdateType.PUT) {
        await trpc.statuses.items.create.mutate({
          id,
          groupId: String(data.group_id ?? ""),
          name: String(data.name ?? ""),
          color: String(data.color ?? "") as StatusColor,
          category: String(data.category ?? "") as StatusCategory,
          ...(data.position != null ? { position: Number(data.position) } : {}),
        })
      } else if (type === UpdateType.PATCH) {
        await trpc.statuses.items.update.mutate({
          id,
          ...(data.name !== undefined ? { name: String(data.name) } : {}),
          ...(data.color !== undefined ? { color: String(data.color) as StatusColor } : {}),
          ...(data.category !== undefined
            ? { category: String(data.category) as StatusCategory }
            : {}),
          ...(data.position !== undefined ? { position: Number(data.position) } : {}),
        })
      } else {
        await trpc.statuses.items.softDelete.mutate({ id })
      }
      return

    case "user_settings":
      // One durable row per user — never deleted; PUT and PATCH both upsert. Send only the columns
      // this write touched so a timezone write (P2-08) and the toggle don't clobber each other.
      if (type !== UpdateType.DELETE) {
        await trpc.statuses.settings.set.mutate({
          ...(data.custom_statuses_enabled !== undefined
            ? { customStatusesEnabled: !!data.custom_statuses_enabled }
            : {}),
          ...(data.timezone !== undefined
            ? { timezone: data.timezone != null ? String(data.timezone) : null }
            : {}),
          ...(data.timezone_auto !== undefined ? { timezoneAuto: !!data.timezone_auto } : {}),
        })
      }
      return

    case "tags":
      if (type === UpdateType.PUT) {
        await trpc.tags.create.mutate({
          id,
          name: String(data.name ?? ""),
          color: String(data.color ?? "") as StatusColor,
          ...(data.position != null ? { position: Number(data.position) } : {}),
        })
      } else if (type === UpdateType.PATCH) {
        await trpc.tags.update.mutate({
          id,
          ...(data.name !== undefined ? { name: String(data.name) } : {}),
          ...(data.color !== undefined ? { color: String(data.color) as StatusColor } : {}),
          ...(data.position !== undefined ? { position: Number(data.position) } : {}),
        })
      } else {
        await trpc.tags.softDelete.mutate({ id })
      }
      return

    case "task_tags": {
      // The id is the deterministic `${taskId}_${tagId}` (uuids never contain "_"), so a
      // DELETE — which carries no opData — still yields the pair. No PATCH: links are immutable.
      const [taskId, tagId] = id.split("_")
      if (taskId && tagId) {
        if (type === UpdateType.DELETE) await trpc.tags.unassign.mutate({ taskId, tagId })
        else await trpc.tags.assign.mutate({ taskId, tagId })
      }
      return
    }
  }
}
