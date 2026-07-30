import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({ component: Home })

const sampleTasks = [
  { id: 1, title: "Set up the monorepo", done: true },
  { id: 2, title: "Stand up the web + desktop shells", done: false },
  { id: 3, title: 'Figure out what a "task" actually is in Pace', done: false },
  { id: 4, title: "Wire the UI to real data (Milestone 07)", done: false },
]

function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <header className="mb-10">
          <h1 className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent">
            Pace
          </h1>
          <p className="mt-2 italic text-neutral-400">set your own pace</p>
          <p className="mt-4 text-xs uppercase tracking-widest text-neutral-500">
            Hello world · static shell
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Sample tasks (hard-coded)
          </h2>
          <ul className="space-y-2">
            {sampleTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3"
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                    task.done
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                      : "border-neutral-600"
                  }`}
                >
                  {task.done ? "✓" : ""}
                </span>
                <span className={task.done ? "text-neutral-500 line-through" : ""}>
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-12 text-xs leading-relaxed text-neutral-600">
          No backend yet — this list is fake data, on purpose. The real data model comes in
          Milestone 04, shaped by living in this shell first.
        </footer>
      </div>
    </main>
  )
}
