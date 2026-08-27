import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from "@powersync/web"
import { authClient } from "../auth-client"
import { getConfig } from "../config"
import { type TrpcClient, uploadOp } from "./upload-op"

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

// Build the connector PowerSync uses to talk to our backend: how to authenticate
// (fetchCredentials) and how to push local writes upstream (uploadData, via uploadOp). Reads
// (the download path) are handled by the sync rules.
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
