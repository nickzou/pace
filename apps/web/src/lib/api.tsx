import { createClient, TRPCProvider } from "@pace/api-client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { getStoredToken } from "./auth-client"
import { getConfig } from "./config"

// Provides the tRPC + TanStack Query context to the whole app. The clients are
// created with useState so each SSR request gets its own (no cross-request data
// leak) while the browser keeps one stable instance. Auth reuses auth-client's
// logic: cookie on web, bearer token on desktop (getStoredToken).
export function ApiProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    createClient({ url: `${getConfig().apiUrl}/api/trpc`, getToken: getStoredToken }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}
