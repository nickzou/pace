import { expoClient } from "@better-auth/expo/client"
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
  ],
})

export const { useSession, signIn, signUp, signOut } = authClient

// Headers the tRPC/api client must send so the API can find the session on
// native: the stored session cookie (there's no cookie jar to send it
// automatically) plus the expo deep-link origin — the same pair the auth client
// attaches to its own /api/auth requests. Empty when signed out.
export function getApiHeaders(): Record<string, string> {
  const cookie = authClient.getCookie()
  if (!cookie) return {}
  return { cookie, "expo-origin": Linking.createURL("", { scheme: "pace" }) }
}
