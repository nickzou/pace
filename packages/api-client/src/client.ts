import type { AppRouter } from "@pace/api/router"
import { createTRPCClient, httpBatchLink } from "@trpc/client"

export type CreateClientOptions = {
  // The tRPC endpoint, e.g. "http://localhost:3001/api/trpc".
  url: string
  // Optional bearer token for the native shells (desktop/mobile). The web app
  // leaves this unset and relies on the session cookie sent via credentials.
  getToken?: () => string | null | undefined
}

// One factory for all three surfaces. It always sends credentials (the cookie
// for web) AND, when getToken returns one, an Authorization: Bearer header (the
// token for desktop/mobile). `AppRouter` is imported type-only, so no server
// code ships to the client — just the shape.
export function createClient(opts: CreateClientOptions) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: opts.url,
        fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
        headers() {
          const token = opts.getToken?.()
          return token ? { authorization: `Bearer ${token}` } : {}
        },
      }),
    ],
  })
}

export type ApiClient = ReturnType<typeof createClient>
