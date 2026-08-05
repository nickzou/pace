import { expoClient } from "@better-auth/expo/client"
import { createAuthClient } from "better-auth/react"
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
