import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { defineHandler } from "nitro/h3"
import { corsHeaders, preflightResponse } from "../../../cors"
import { createContext } from "../../../trpc/context"
import { appRouter } from "../../../trpc/router"

// Mounts the tRPC router at /api/trpc/**. CORS is shared with the auth route so
// the browser clients (web cross-origin, desktop tauri://) can call it.
export default defineHandler(async (event) => {
  const headers = corsHeaders(event.req.headers.get("origin"))
  if (event.req.method === "OPTIONS") return preflightResponse(event.req, headers)

  // Rebuild a native Request (same reason as the auth route — srvx's Request
  // trips up some consumers) before handing it to tRPC's fetch adapter.
  const raw = event.req
  const hasBody = raw.method !== "GET" && raw.method !== "HEAD"
  const req = new Request(raw.url, {
    method: raw.method,
    headers: raw.headers,
    body: hasBody ? await raw.arrayBuffer() : undefined,
  })

  const res = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
  })
  for (const [key, value] of headers) res.headers.set(key, value)
  return res
})
