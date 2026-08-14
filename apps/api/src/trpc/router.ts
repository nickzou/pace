import { router } from "./init"
import { itemsRouter } from "./routers/items"
import { tasksRouter } from "./routers/tasks"

export const appRouter = router({
  tasks: tasksRouter,
  items: itemsRouter,
})

// The single type clients import to get end-to-end type safety against
// this server — no codegen, no duplication.
export type AppRouter = typeof appRouter
