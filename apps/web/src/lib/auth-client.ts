import { createAuthClient } from "better-auth/react"

// Talks to the standalone API (apps/api). Cross-origin in dev (:3000 → :3001);
// the client sends credentials and the API trusts this origin (TRUSTED_ORIGINS).
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3001",
})

export const { signIn, signUp, signOut, useSession } = authClient
