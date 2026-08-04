import { defineHandler } from "nitro/h3"
import { auth } from "../../../auth"
import { env } from "../../../env"

// Mounts Better Auth at /api/auth/** (sign-up, sign-in, session, sign-out, ...).
// h3 v2's event.req is a web Request and auth.handler returns a web Response.
//
// Better Auth's trustedOrigins only does CSRF origin validation — it does NOT
// emit CORS headers. The browser preflights our JSON POSTs, so we handle CORS
// here, echoing the origin only if it's trusted (credentials require a specific
// origin, never "*"). We set headers on the actual Response object rather than
// via middleware, so they can't be dropped when Better Auth returns its own.
const trusted = new Set(env.TRUSTED_ORIGINS.split(","))

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers()
  if (origin && trusted.has(origin)) {
    headers.set("access-control-allow-origin", origin)
    headers.set("access-control-allow-credentials", "true")
    headers.set("vary", "origin")
  }
  return headers
}

export default defineHandler(async (event) => {
  const origin = event.req.headers.get("origin")
  const headers = corsHeaders(origin)

  // Preflight — answer directly, reflecting the requested headers/method.
  if (event.req.method === "OPTIONS") {
    headers.set("access-control-allow-methods", "GET,POST,OPTIONS")
    headers.set(
      "access-control-allow-headers",
      event.req.headers.get("access-control-request-headers") ?? "content-type",
    )
    headers.set("access-control-max-age", "600")
    return new Response(null, { status: 204, headers })
  }

  const res = await auth.handler(event.req)
  for (const [key, value] of headers) res.headers.set(key, value)
  return res
})
