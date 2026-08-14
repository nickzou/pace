import { Link } from "@tanstack/react-router"
import { type ReactNode, useEffect, useState } from "react"
import { useSession } from "#/lib/auth-client"
import { PowerSyncProvider } from "#/lib/powersync/provider"

// Gates children behind the client + a signed-in session, then provides the local
// PowerSync database. @powersync/web (wa-sqlite) can't run during SSR and there's
// nothing to sync until we can mint a token, so we wait for both `mounted` and
// `session` before mounting the provider. Shared by the tasks list and the task
// detail route so both reach the same singleton DB the same way.
export function RequireLocalDb({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (isPending || !mounted) return <p className="text-sm text-neutral-500">…</p>
  if (!session) {
    return (
      <p className="text-sm text-neutral-400">
        <Link to="/sign-in" className="text-sky-400 hover:underline">
          Sign in
        </Link>{" "}
        to see your tasks.
      </p>
    )
  }

  return <PowerSyncProvider>{children}</PowerSyncProvider>
}
