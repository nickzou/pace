import { defineTask } from "nitro/task"
import { purgeExpiredDeletions } from "../../db/account"

// Nitro scheduled task (name derived from the path → "db:purge-deleted"). Runs daily via the
// in-process croner scheduler configured in nitro.config.ts — the schedule lives in the app, not
// in CI. A thin wrapper over the pure purgeExpiredDeletions(); can also be invoked on demand with
// Nitro's runTask (dev) for a manual sweep.
export default defineTask({
  meta: {
    name: "db:purge-deleted",
    description: "Hard-delete accounts whose 30-day deletion grace period has elapsed",
  },
  async run() {
    const purged = await purgeExpiredDeletions()
    if (purged > 0) console.log(`[purge-deleted] purged ${purged} expired account(s)`)
    return { result: { purged } }
  },
})
