import type { useTRPCClient } from "@pace/api-client"
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/web"
import { UpdateType } from "@powersync/web"
import { authClient } from "../auth-client"
import { getConfig } from "../config"

// The imperative tRPC client (from useTRPCClient) — the write path PowerSync
// replays local mutations through. No new backend: this is the same API the
// UI used, now driven by the sync engine instead of the UI directly.
type TrpcClient = ReturnType<typeof useTRPCClient>

// tRPC error codes that a retry can't fix (bad input, gone, not ours). We drop
// the offending change instead of blocking the upload queue forever. Everything
// else (offline, 5xx) is transient — we rethrow so PowerSync retries.
const FATAL_CODES = new Set(["BAD_REQUEST", "NOT_FOUND", "CONFLICT", "FORBIDDEN"])

function isFatal(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "data" in err
      ? (err as { data?: { code?: string } }).data?.code
      : undefined
  return typeof code === "string" && FATAL_CODES.has(code)
}

// Build the connector PowerSync uses to talk to our backend. It needs two things:
// how to authenticate (fetchCredentials) and how to push local writes upstream
// (uploadData). Reads (the download path) are handled by the sync rules — nothing
// to do here.
export function createConnector(trpc: TrpcClient): PowerSyncBackendConnector {
  return {
    // Mint a fresh JWT for the signed-in user. authClient handles the transport
    // (cookie on web, bearer on desktop); PowerSync verifies the token via JWKS.
    async fetchCredentials() {
      const { data } = await authClient.token()
      if (!data?.token) throw new Error("Not authenticated — no PowerSync token")
      return { endpoint: getConfig().powersyncUrl, token: data.token }
    },

    // Drain the local write queue one transaction at a time, mapping each row op
    // to the matching tRPC procedure. PowerSync calls this whenever there are
    // pending local changes and a connection is available.
    async uploadData(database: AbstractPowerSyncDatabase) {
      const tx = await database.getNextCrudTransaction()
      if (!tx) return

      try {
        for (const op of tx.crud) {
          const data = op.opData ?? {}

          // Route to the appropriate router based on table name
          if (op.table === "tasks") {
            switch (op.op) {
              case UpdateType.PUT:
                // A locally-created task. create upserts on the client-minted id,
                // so a retried upload is idempotent.
                await trpc.tasks.create.mutate({
                  id: op.id,
                  title: String(data.title ?? ""),
                  description: String(data.description ?? ""),
                  completed: !!data.completed,
                })
                break
              case UpdateType.PATCH:
                // A field change — send only what changed.
                await trpc.tasks.update.mutate({
                  id: op.id,
                  ...(data.title !== undefined ? { title: String(data.title) } : {}),
                  ...(data.description !== undefined
                    ? { description: String(data.description) }
                    : {}),
                  ...(data.completed !== undefined ? { completed: !!data.completed } : {}),
                })
                break
              case UpdateType.DELETE:
                // A local delete becomes a soft delete server-side; the tombstone
                // then removes the row from every device via the sync rules.
                await trpc.tasks.softDelete.mutate({ id: op.id })
                break
            }
          } else if (op.table === "items") {
            switch (op.op) {
              case UpdateType.PUT:
                // A locally-created item. create upserts on the client-minted id,
                // so a retried upload is idempotent.
                await trpc.items.create.mutate({
                  id: op.id,
                  title: String(data.title ?? ""),
                  description: String(data.description ?? ""),
                  completed: !!data.completed,
                })
                break
              case UpdateType.PATCH:
                // A field change — send only what changed.
                await trpc.items.update.mutate({
                  id: op.id,
                  ...(data.title !== undefined ? { title: String(data.title) } : {}),
                  ...(data.description !== undefined
                    ? { description: String(data.description) }
                    : {}),
                  ...(data.completed !== undefined ? { completed: !!data.completed } : {}),
                })
                break
              case UpdateType.DELETE:
                // A local delete becomes a soft delete server-side; the tombstone
                // then removes the row from every device via the sync rules.
                await trpc.items.softDelete.mutate({ id: op.id })
                break
            }
          }
        }
        await tx.complete()
      } catch (err) {
        if (isFatal(err)) {
          // Can't ever succeed — drop this batch so the queue keeps moving.
          console.error("PowerSync: discarding un-uploadable change", err)
          await tx.complete()
          return
        }
        // Transient — leave it on the queue; PowerSync backs off and retries.
        throw err
      }
    },
  }
}
