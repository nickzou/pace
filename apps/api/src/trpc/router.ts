import { router } from "./init"
import { statusesRouter } from "./routers/statuses"
import { tasksRouter } from "./routers/tasks"

export const appRouter = router({
  tasks: tasksRouter,
  statuses: statusesRouter,
})

// The single type M09's clients import to get end-to-end type safety against
// this server — no codegen, no duplication.
export type AppRouter = typeof appRouter
