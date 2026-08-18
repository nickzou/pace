import type { useTRPCClient } from "@pace/api-client"
import type { StatusColor } from "@pace/tokens"
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/web"
import { UpdateType } from "@powersync/web"
import { authClient } from "../auth-client"
import { getConfig } from "../config"

// The imperative tRPC client (from useTRPCClient) — the write path PowerSync replays
// local mutations through. No new backend: the same API the UI used, now driven by the
// sync engine.
type TrpcClient = ReturnType<typeof useTRPCClient>
type StatusCategory = "open" | "in_progress" | "done"

// tRPC error codes that a retry can't fix (bad input, gone, not ours). We drop the
// offending change instead of blocking the upload queue forever. Everything else
// (offline, 5xx) is transient — we rethrow so PowerSync retries.
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
// delete) mirrors its router. resolved_at is server-owned, so we never upload it — the
// server derives it from the status category.
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
        })
      } else if (type === UpdateType.PATCH) {
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
        })
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
      // One durable row per user — never deleted; PUT and PATCH both upsert the toggle.
      if (type !== UpdateType.DELETE) {
        await trpc.statuses.settings.set.mutate({
          customStatusesEnabled: !!data.custom_statuses_enabled,
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

// Build the connector PowerSync uses to talk to our backend: how to authenticate
// (fetchCredentials) and how to push local writes upstream (uploadData). Reads (the
// download path) are handled by the sync rules.
export function createConnector(trpc: TrpcClient): PowerSyncBackendConnector {
  return {
    // Mint a fresh JWT for the signed-in user. authClient handles the transport (cookie
    // on web, bearer on desktop); PowerSync verifies the token via JWKS.
    async fetchCredentials() {
      const { data } = await authClient.token()
      if (!data?.token) throw new Error("Not authenticated — no PowerSync token")
      return { endpoint: getConfig().powersyncUrl, token: data.token }
    },

    // Drain the local write queue one transaction at a time. PowerSync calls this
    // whenever there are pending local changes and a connection is available.
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
