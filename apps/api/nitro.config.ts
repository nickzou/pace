import { defineNitroConfig } from "nitro/config"

// Standalone Pace API server. Client-agnostic HTTP — web, desktop, and mobile
// all call it. Built on the node-server preset so it Dockerizes like apps/web.
export default defineNitroConfig({
  compatibilityDate: "2026-08-04",
  preset: "node-server",
  serverDir: "src",
})
