import { defineHandler } from "nitro/h3"
import { auth } from "../../../auth"
import { corsHeaders, preflightResponse } from "../../../cors"

// Mounts Better Auth at /api/auth/** (sign-up, sign-in, session, sign-out, ...).
// h3 v2's event.req is a web Request and auth.handler returns a web Response.
// CORS is shared with the tRPC route (see ../../../cors).
export default defineHandler(async (event) => {
  const headers = corsHeaders(event.req.headers.get("origin"))
  if (event.req.method === "OPTIONS") return preflightResponse(event.req, headers)

  // Rebuild a native Request before handing off. h3/srvx provides its own
  // Request implementation, but Better Auth's expo plugin does `new Request(req)`
  // with Node's undici Request, which rejects a foreign instance ("Cannot read
  // private member #state"). Reconstructing from url/method/headers/body yields a
  // native Request the whole pipeline accepts.
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
