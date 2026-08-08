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
    // Let cross-origin JS read the bearer token off the response (Better Auth's
    // bearer plugin emits it here) — the desktop app needs this to work.
    headers.set("access-control-expose-headers", "set-auth-token")
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

  // Rebuild a native Request before handing off. h3/srvx provides its own
  // Request implementation, but Better Auth's expo plugin does
  // `new Request(req, …)` with Node's undici Request, which rejects a foreign
  // instance ("Cannot read private member #state"). Reconstructing from
  // url/method/headers/body yields a native Request the whole pipeline accepts.
  const raw = event.req
  const hasBody = raw.method !== "GET" && raw.method !== "HEAD"
  const req = new Request(raw.url, {
    method: raw.method,
    headers: raw.headers,
    body: hasBody ? await raw.arrayBuffer() : undefined,
  })

  const res = await auth.handler(req)
  for (const [key, value] of headers) res.headers.set(key, value)
  return res
})
