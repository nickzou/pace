import { defineHandler } from "nitro/h3"

// Liveness probe. Confirms the API server is up before we mount Better Auth.
export default defineHandler(() => ({
  status: "ok",
  service: "@pace/api",
}))
