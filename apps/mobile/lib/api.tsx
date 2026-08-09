import { createClient, TRPCProvider } from "@pace/api-client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { getApiHeaders } from "./auth-client"

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001"

// tRPC + TanStack Query context for the mobile app. Auth goes through the
// session cookie + expo-origin headers (getApiHeaders) since native has no
// cookie jar. Clients live in useState so they're created once.
export function ApiProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    createClient({ url: `${API_URL}/api/trpc`, headers: getApiHeaders }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
