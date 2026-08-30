import { expoClient } from "@better-auth/expo/client"
import { jwtClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import * as Linking from "expo-linking"
import * as SecureStore from "expo-secure-store"

// Talks to the standalone API (apps/api). Unlike the web/desktop cookie flow,
// the Expo client stores the session token in the OS secure store and replays
// it as a header — no browser cookie jar on native.
//
// NOTE: on a real device, `localhost` points at the phone, not your dev
// machine. Set EXPO_PUBLIC_API_URL to the machine's LAN IP (e.g.
// http://192.168.1.20:3001) or the deployed API URL when running on-device.
export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001",
  plugins: [
    expoClient({
      scheme: "pace",
      storagePrefix: "pace",
      // SDK 57 SecureStore exposes the sync getItem/setItem the client expects.
      storage: SecureStore,
    }),
    // jwtClient() exposes authClient.token() — the short-lived JWT the PowerSync
    // connector hands to the sync service (verified via /api/auth/jwks).
    jwtClient(),
  ],
})

export const { useSession, signIn, signUp } = authClient

// (Re)send the verification email. The API rewrites the link's callbackURL to the
// public web /verified page regardless of what we pass, so the same link works
// from every platform — we just name the destination here for clarity.
export function resendVerificationEmail(email: string) {
  return authClient.sendVerificationEmail({ email, callbackURL: "/verified" })
}

// Wrap sign-out to also wipe the local PowerSync DB. This is the ONLY place we
// clear it, so an incidental unmount (e.g. a transient session blip on reconnect)
// can never drop local data — including offline writes still waiting to upload.
export async function signOut() {
  const result = await authClient.signOut()
  const { clearDb } = await import("./powersync/db")
  await clearDb()
  return result
}

// True when a session is stored locally (in SecureStore). This is the offline-
// durable source of truth for "am I logged in" — useSession().data blips to null
// when the server is unreachable (offline / reconnect), but the stored session is
// still valid, so the UI should stay signed in. Cleared by signOut().
export function hasStoredSession(): boolean {
  return !!authClient.getCookie()
}

// Headers the tRPC/api client must send so the API can find the session on
// native: the stored session cookie (there's no cookie jar to send it
// automatically) plus the expo deep-link origin — the same pair the auth client
// attaches to its own /api/auth requests. Empty when signed out.
export function getApiHeaders(): Record<string, string> {
  const cookie = authClient.getCookie()
  if (!cookie) return {}
  return { cookie, "expo-origin": Linking.createURL("", { scheme: "pace" }) }
}
