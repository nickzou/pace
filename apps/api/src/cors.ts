import { env } from "./env"

// Shared CORS for the browser-facing routes (auth + tRPC). Better Auth's
// trustedOrigins does CSRF origin validation but does NOT emit CORS headers, so
// we set them here — echoing the request origin only if it's trusted (a request
// with credentials requires a specific origin, never "*"). Headers go on the
// actual Response so they can't be dropped by whatever the handler returns.
const trusted = new Set(env.TRUSTED_ORIGINS.split(","))

export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers()
  if (origin && trusted.has(origin)) {
    headers.set("access-control-allow-origin", origin)
    headers.set("access-control-allow-credentials", "true")
    // Let cross-origin JS read the bearer token off the response (Better Auth's
    // bearer plugin emits set-auth-token) — desktop/mobile need this.
    headers.set("access-control-expose-headers", "set-auth-token")
    headers.set("vary", "origin")
  }
  return headers
}

// A preflight (OPTIONS) response reflecting the requested method/headers.
export function preflightResponse(req: Request, headers: Headers): Response {
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS")
  headers.set(
    "access-control-allow-headers",
    req.headers.get("access-control-request-headers") ?? "authorization,content-type",
  )
  headers.set("access-control-max-age", "600")
  return new Response(null, { status: 204, headers })
}
