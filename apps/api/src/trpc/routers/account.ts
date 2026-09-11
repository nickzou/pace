import { TRPCError } from "@trpc/server"
import { auth } from "../../auth"
import { credentialPasswordHash, markDeletionRequested } from "../../db/account"
import { requestDeletionSchema } from "../../domain"
import { protectedProcedure, router } from "../init"

// Account lifecycle (Delete Account). Request-deletion is a reauth-gated mutation: the user must
// re-enter their password AND type the confirmation word (validated by requestDeletionSchema).
// On success it arms the 30-day grace period — stamps deletion_requested_at and revokes every
// session — so all devices sign out and sync stops. Reactivation (cancel) happens automatically
// when the user signs back in within the window (the session.create hook in auth.ts).
export const accountRouter = router({
  requestDeletion: protectedProcedure
    .input(requestDeletionSchema)
    .mutation(async ({ ctx, input }) => {
      // Reauthenticate against the stored credential-account hash. A social-only account (future)
      // has no password — reject rather than let it delete without reauth.
      const hash = await credentialPasswordHash(ctx.userId)
      if (!hash)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This account has no password to confirm deletion with.",
        })
      const { password } = await auth.$context
      if (!(await password.verify({ hash, password: input.password })))
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect password." })

      const at = await markDeletionRequested(ctx.userId)
      return { deletionRequestedAt: at.toISOString() }
    }),
})
