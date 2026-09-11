import { defineNitroConfig } from "nitro/config"

// Standalone Pace API server. Client-agnostic HTTP — web, desktop, and mobile
// all call it. Built on the node-server preset so it Dockerizes like apps/web.
export default defineNitroConfig({
  compatibilityDate: "2026-08-04",
  preset: "node-server",
  serverDir: "src",
  // Scheduled tasks (Delete Account purge). `experimental.tasks` builds the task graph;
  // `scheduledTasks` maps a cron to a task name. With the node-server preset Nitro runs an
  // in-process croner scheduler at startup (startScheduleRunner) — the schedule lives IN the app,
  // no external cron / CI. src/tasks/db/purge-deleted.ts → task name "db:purge-deleted".
  experimental: { tasks: true },
  scheduledTasks: {
    "0 4 * * *": ["db:purge-deleted"], // daily at 04:00 (server time) — sweep expired accounts
  },
})
