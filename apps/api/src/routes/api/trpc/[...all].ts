import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { defineHandler } from "nitro/h3"
import { createContext } from "../../../trpc/context"
import { appRouter } from "../../../trpc/router"

// Mounts the tRPC router at /api/trpc/**. h3 v2's event.req is a web Request; we
// rebuild a native one (same reason as the auth route — srvx's Request trips up
// some consumers) before handing it to tRPC's fetch adapter.
//
// CORS for cross-origin browser clients lands with the client wiring in M09;
// the API is same-origin-callable (and bearer-callable) as-is.
export default defineHandler(async (event) => {
  const raw = event.req
  const hasBody = raw.method !== "GET" && raw.method !== "HEAD"
  const req = new Request(raw.url, {
    method: raw.method,
    headers: raw.headers,
    body: hasBody ? await raw.arrayBuffer() : undefined,
  })

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
  })
})
