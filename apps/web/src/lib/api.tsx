import { createClient, TRPCProvider } from "@pace/api-client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { getStoredToken } from "./auth-client"

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

// Provides the tRPC + TanStack Query context to the whole app. The clients are
// created with useState so each SSR request gets its own (no cross-request data
// leak) while the browser keeps one stable instance. Auth reuses auth-client's
// logic: cookie on web, bearer token on desktop (getStoredToken).
export function ApiProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    createClient({ url: `${API_URL}/api/trpc`, getToken: getStoredToken }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
