import { createAuthClient } from "better-auth/react"

// The packaged desktop app is served from tauri:// (Linux/macOS) or
// http://tauri.localhost (Windows) — a different *site* from the API, so the
// browser won't attach the session cookie on cross-site requests. There we
// authenticate with a bearer token instead: capture it from Better Auth's
// `set-auth-token` response header, store it, and send it as Authorization.
//
// Normal web — and `tauri dev`, which loads http://localhost:3000 (same-site
// with the API) — stays on cookies, unchanged.
const useTokens =
  typeof window !== "undefined" &&
  (window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost")

const TOKEN_KEY = "pace.token"

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3001",
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
