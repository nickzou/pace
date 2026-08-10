import { jwtClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

// The packaged desktop app is served from tauri:// (Linux/macOS) or
// http://tauri.localhost (Windows) — a different *site* from the API, so the
// browser won't attach the session cookie on cross-site requests. There we
// authenticate with a bearer token instead: capture it from Better Auth's
// `set-auth-token` response header, store it, and send it as Authorization.
//
// Normal web — and `tauri dev`, which loads http://localhost:3000 (same-site
// with the API) — stays on cookies, unchanged.
// True on the packaged desktop app (served from tauri://), where cookies aren't
// sent cross-site so we authenticate with a stored bearer token instead.
export const useTokens =
  typeof window !== "undefined" &&
  (window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost")

const TOKEN_KEY = "pace.token"

// The bearer token for the tRPC/api client to send on desktop; null on web
// (which relies on the session cookie). Same storage the auth client uses.
export function getStoredToken(): string | null {
  return useTokens ? localStorage.getItem(TOKEN_KEY) : null
}

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3001",
  // jwtClient() exposes authClient.token(), which mints the short-lived JWT the
  // PowerSync connector hands to the sync service (verified via /api/auth/jwks).
  plugins: [jwtClient()],
  fetchOptions: useTokens
    ? {
        onSuccess: (ctx) => {
          const token = ctx.response.headers.get("set-auth-token")
          if (token) localStorage.setItem(TOKEN_KEY, token)
        },
        auth: {
          type: "Bearer",
          token: () => localStorage.getItem(TOKEN_KEY) ?? "",
        },
      }
    : undefined,
})

export const { signIn, signUp, useSession } = authClient

// On desktop there's no cookie for the browser to drop, so clear the stored
// token ourselves. Wrap signOut so callers don't need to know which mode we're in.
export async function signOut() {
  const result = await authClient.signOut()
  if (useTokens) localStorage.removeItem(TOKEN_KEY)
  return result
}
