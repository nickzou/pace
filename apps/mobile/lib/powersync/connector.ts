import type { useTRPCClient } from "@pace/api-client"
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/react-native"
import { UpdateType } from "@powersync/react-native"
import { authClient } from "../auth-client"

// The mobile twin of apps/web's powersync/connector.ts. Same op-mapping; the
// platform-specific bits are the auth client (expo) and the env var.
type TrpcClient = ReturnType<typeof useTRPCClient>

// On a real device this must be the dev machine's LAN IP (like EXPO_PUBLIC_API_URL),
// not localhost — localhost is the phone. The emulator uses 10.0.2.2.
const POWERSYNC_URL = process.env.EXPO_PUBLIC_POWERSYNC_URL ?? "http://localhost:8080"

// tRPC error codes a retry can't fix — drop the change instead of blocking the
// upload queue. Everything else (offline, 5xx) is transient: rethrow to retry.
const FATAL_CODES = new Set(["BAD_REQUEST", "NOT_FOUND", "CONFLICT", "FORBIDDEN"])

function isFatal(err: unknown): boolean {
  const code =
    err && typeof err === "object" && "data" in err
      ? (err as { data?: { code?: string } }).data?.code
      : undefined
  return typeof code === "string" && FATAL_CODES.has(code)
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

    // Replay local writes through the existing tRPC procedures, one transaction
    // at a time.
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
                await trpc.tasks.create.mutate({
                  id: op.id,
                  title: String(data.title ?? ""),
                  description: String(data.description ?? ""),
                  completed: !!data.completed,
                })
                break
              case UpdateType.PATCH:
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
                await trpc.tasks.softDelete.mutate({ id: op.id })
                break
            }
          } else if (op.table === "items") {
            switch (op.op) {
              case UpdateType.PUT:
                await trpc.items.create.mutate({
                  id: op.id,
                  title: String(data.title ?? ""),
                  description: String(data.description ?? ""),
                  completed: !!data.completed,
                })
                break
              case UpdateType.PATCH:
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
                await trpc.items.softDelete.mutate({ id: op.id })
                break
            }
          }
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
