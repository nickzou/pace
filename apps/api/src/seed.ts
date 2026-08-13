// Seed a single known-password test user into NON-prod environments, so a
// reviewer can log straight into a gated preview (see deploy/stack/
// preview.override.yml). Created through Better Auth (auth.api.signUpEmail) so
// the password hash + auth tables are valid — never raw SQL. Idempotent: running
// it against an env that already has the user is a no-op, so it's safe on every
// preview redeploy. up.sh runs it after migrations, and NEVER for prod.
//
// Credentials are intentionally hardcoded: previews are short-lived and already
// sit behind HTTP Basic Auth. This is the one seed harness — future task fixtures
// would slot in here as `db.insert(tasks)` after the user exists (PowerSync then
// replicates them to clients), rather than as a separate mechanism.
import { auth } from "./auth"

const TEST_USER = {
  email: "test@paceproductivity.app",
  password: "pace-preview-tester",
  name: "Preview Tester",
}

async function seed(): Promise<void> {
  try {
    await auth.api.signUpEmail({ body: { ...TEST_USER } })
    console.log(`[seed] created test user ${TEST_USER.email}`)
  } catch (err) {
    const code = (err as { body?: { code?: string } }).body?.code
    const message = err instanceof Error ? err.message : String(err)
    if (code === "USER_ALREADY_EXISTS" || /already exists/i.test(message)) {
      console.log(`[seed] test user ${TEST_USER.email} already exists — skipping`)
      return
    }
    throw err
  }
}

// postgres.js keeps the event loop alive, so exit explicitly once seeding is done.
seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] failed:", err)
    process.exit(1)
  })
