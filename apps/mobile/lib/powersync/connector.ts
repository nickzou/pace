import { type TrpcClient, uploadOp } from "@pace/api-client"
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/react-native"
import { authClient } from "../auth-client"

// The mobile twin of apps/web's powersync/connector.ts. The op→mutation mapping is shared with web
// via @pace/api-client's uploadOp; the platform-specific bits here are the auth client (expo) and
// the env var.

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
