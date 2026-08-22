import type { useTRPCClient } from "@pace/api-client"
import type { StatusColor } from "@pace/tokens"
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/react-native"
import { UpdateType } from "@powersync/react-native"
import { authClient } from "../auth-client"

// The mobile twin of apps/web's powersync/connector.ts. Same op-mapping; the
// platform-specific bits are the auth client (expo) and the env var.
type TrpcClient = ReturnType<typeof useTRPCClient>
type StatusCategory = "open" | "in_progress" | "done"

// On a real device this must be the dev machine's LAN IP (like EXPO_PUBLIC_API_URL),
// not localhost — localhost is the phone. The emulator uses 10.0.2.2.
const POWERSYNC_URL = process.env.EXPO_PUBLIC_POWERSYNC_URL ?? "http://localhost:8080"

// tRPC error codes a retry can't fix — drop the change instead of blocking the upload
// queue. Everything else (offline, 5xx) is transient: rethrow to retry.
const FATAL_CODES = new Set([
  "BAD_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "FORBIDDEN",
  "PRECONDITION_FAILED",
])

function isFatal(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "data" in err
      ? (err as { data?: { code?: string } }).data?.code
      : undefined
  return typeof code === "string" && FATAL_CODES.has(code)
}

// Map one local row op to the matching tRPC procedure. Split by table; each table's PUT
// (create — upserts on the client-minted id) / PATCH (partial update) / DELETE (soft
// delete) mirrors its router. resolved_at is server-owned, so we never upload it.
async function uploadOp(
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
        // A re-parent is an isolated parent_id change (setTaskParent writes only that column),
        // so it routes to the guarded setParent procedure — not the generic update. null
        // promotes to top-level.
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
          await trpc.tasks.update.mutate({
            id,
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
          })
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
      // Send only the columns this write touched so a timezone write (P2-08) and the toggle don't
      // clobber each other (settings.set is partial server-side).
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

export function createConnector(trpc: TrpcClient): PowerSyncBackendConnector {
  return {
    // Mint a JWT for the signed-in user (the expo auth client attaches the stored
    // session); PowerSync verifies it via JWKS.
    async fetchCredentials() {
      const { data } = await authClient.token()
      if (!data?.token) throw new Error("Not authenticated — no PowerSync token")
      return { endpoint: POWERSYNC_URL, token: data.token }
    },

    // Replay local writes through the existing tRPC procedures, one transaction at a time.
    async uploadData(database: AbstractPowerSyncDatabase) {
      const tx = await database.getNextCrudTransaction()
      if (!tx) return

      try {
        for (const op of tx.crud) {
          await uploadOp(trpc, op.table, op.op, op.id, op.opData ?? {})
        }
        await tx.complete()
      } catch (err) {
        if (isFatal(err)) {
          console.error("PowerSync: discarding un-uploadable change", err)
          await tx.complete()
          return
        }
        throw err
      }
    },
  }
}
