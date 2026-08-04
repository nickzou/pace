import { defineHandler } from "nitro/h3"
import { auth } from "../../../auth"

// Mounts Better Auth at /api/auth/** (sign-up, sign-in, session, sign-out, ...).
// h3 v2's event.req is a web Request and auth.handler returns a web Response.
export default defineHandler((event) => auth.handler(event.req))
