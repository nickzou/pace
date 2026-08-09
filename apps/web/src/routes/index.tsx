import { useTRPC } from "@pace/api-client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { signOut, useSession } from "#/lib/auth-client"

export const Route = createFileRoute("/")({ component: Home })

function AuthBar() {
  const { data: session, isPending } = useSession()

  return (
    <div className="mb-8 flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
      {isPending ? (
        <span className="text-neutral-500">…</span>
      ) : session ? (
        <>
          <span className="text-neutral-400">
            Signed in as <span className="text-neutral-100">{session.user.email}</span>
          </span>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-md border border-neutral-700 px-3 py-1 text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100"
          >
            Sign out
          </button>
        </>
      ) : (
        <>
          <span className="text-neutral-400">You're not signed in.</span>
          <span className="flex gap-3">
            <Link to="/sign-in" className="text-sky-400 hover:underline">
              Sign in
            </Link>
            <Link to="/sign-up" className="text-sky-400 hover:underline">
              Sign up
            </Link>
          </span>
        </>
      )}
    </div>
  )
}

function Tasks() {
  const { data: session, isPending: sessionPending } = useSession()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState("")

  const listKey = trpc.tasks.list.queryKey()
  const tasks = useQuery({ ...trpc.tasks.list.queryOptions(), enabled: !!session })

  const createTask = useMutation(
    trpc.tasks.create.mutationOptions({
      // Optimistic: drop the new task into the cached list immediately, roll back
      // on error, and re-fetch on settle to reconcile with the server.
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: listKey })
        const previous = queryClient.getQueryData(listKey)
        const now = new Date().toISOString()
        queryClient.setQueryData(listKey, (old = []) => [
          {
            id: `optimistic-${now}`,
            title: input.title,
            description: input.description ?? "",
            completed: false,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          },
          ...old,
        ])
        return { previous }
      },
      onError: (_error, _input, context) => {
        if (context?.previous) queryClient.setQueryData(listKey, context.previous)
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
    }),
  )

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    createTask.mutate({ title: trimmed })
    setTitle("")
  }

  if (sessionPending) return <p className="text-sm text-neutral-500">…</p>
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

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
        Tasks
      </h2>

      <form onSubmit={onSubmit} className="mb-4 flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={!title.trim() || createTask.isPending}
          className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-neutral-950 transition hover:bg-sky-400 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {tasks.isPending ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : tasks.isError ? (
        <p className="text-sm text-red-400">Couldn't load tasks.</p>
      ) : tasks.data.length === 0 ? (
        <p className="text-sm text-neutral-500">No tasks yet — add your first above.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.data.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                  task.completed
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                    : "border-neutral-600"
                }`}
              >
                {task.completed ? "✓" : ""}
              </span>
              <span className={task.completed ? "text-neutral-500 line-through" : ""}>
                {task.title}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <AuthBar />
        <header className="mb-10">
          <h1 className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent">
            Pace
          </h1>
          <p className="mt-2 italic text-neutral-400">set your own pace</p>
        </header>
        <Tasks />
      </div>
    </main>
  )
}
