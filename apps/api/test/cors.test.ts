import { describe, expect, it } from "vitest"
import { corsHeaders, preflightResponse } from "../src/cors"

// http://localhost:3000 is in TRUSTED_ORIGINS locally (.env) and is env.ts's
// default when the var is unset (CI) — so it's trusted in both environments.
const TRUSTED = "http://localhost:3000"

describe("corsHeaders", () => {
  it("echoes a trusted origin with credentials — never a wildcard", () => {
    const h = corsHeaders(TRUSTED)
    expect(h.get("access-control-allow-origin")).toBe(TRUSTED)
    expect(h.get("access-control-allow-credentials")).toBe("true")
    expect(h.get("access-control-expose-headers")).toBe("set-auth-token")
    expect(h.get("vary")).toBe("origin")
  })

  it("emits nothing for an untrusted origin", () => {
    const h = corsHeaders("https://evil.example")
    expect(h.get("access-control-allow-origin")).toBeNull()
    expect(h.get("access-control-allow-credentials")).toBeNull()
  })

  it("emits nothing when there is no origin", () => {
    expect(corsHeaders(null).get("access-control-allow-origin")).toBeNull()
  })
})

describe("preflightResponse", () => {
  it("returns a 204 reflecting the requested headers, carrying the CORS headers", () => {
    const req = new Request("http://localhost/api/trpc", {
      method: "OPTIONS",
      headers: { "access-control-request-headers": "authorization,content-type" },
    })
    const res = preflightResponse(req, corsHeaders(TRUSTED))
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-methods")).toBe("GET,POST,OPTIONS")
    expect(res.headers.get("access-control-allow-headers")).toBe("authorization,content-type")
    expect(res.headers.get("access-control-max-age")).toBe("600")
    expect(res.headers.get("access-control-allow-origin")).toBe(TRUSTED)
  })

  it("falls back to a default allow-headers when none are requested", () => {
    const req = new Request("http://localhost/api/trpc", { method: "OPTIONS" })
    const res = preflightResponse(req, new Headers())
    expect(res.headers.get("access-control-allow-headers")).toBe("authorization,content-type")
  })
})
