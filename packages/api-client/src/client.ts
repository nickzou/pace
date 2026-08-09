import type { AppRouter } from "@pace/api/router"
import { createTRPCClient, httpBatchLink } from "@trpc/client"

export type CreateClientOptions = {
  // The tRPC endpoint, e.g. "http://localhost:3001/api/trpc".
  url: string
  // Optional bearer token for desktop (from localStorage). Web leaves this unset
  // and relies on the session cookie sent via credentials.
  getToken?: () => string | null | undefined
  // Extra headers per request — mobile uses this to send the session `cookie`
  // (there's no cookie jar on native) and the `expo-origin` header.
  headers?: () => Record<string, string>
}

// One factory for all three surfaces. It always sends credentials (the cookie
// for web), adds an Authorization: Bearer header when getToken returns one
// (desktop), and merges any custom headers (mobile). `AppRouter` is imported
// type-only, so no server code ships to the client — just the shape.
export function createClient(opts: CreateClientOptions) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: opts.url,
        fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
        headers() {
          const token = opts.getToken?.()
          return {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(opts.headers?.() ?? {}),
          }
        },
      }),
    ],
  })
}

export type ApiClient = ReturnType<typeof createClient>
