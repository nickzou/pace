import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { signUp } from "#/lib/auth-client"

export const Route = createFileRoute("/sign-up")({ component: SignUp })

function SignUp() {
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await signUp.email({ name, email, password })
    setPending(false)
    if (result.error) {
      setError(result.error.message ?? "Could not create account")
      return
    }
    navigate({ to: "/" })
  }

  return (
    <AuthShell
      title="Create your account"
      footer={
        <Link to="/sign-in" className="text-sky-400 hover:underline">
          Already have an account? Sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" value={name} onChange={setName} type="text" autoComplete="name" />
        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="new-password"
        />
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <SubmitButton pending={pending}>Sign up</SubmitButton>
      </form>
    </AuthShell>
  )
}

export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-300"
        >
          ← Pace
        </Link>
        <h1 className="mt-4 mb-6 text-2xl font-semibold">{title}</h1>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">{children}</div>
        <p className="mt-4 text-sm text-neutral-400">{footer}</p>
      </div>
    </main>
  )
}

export function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type: string
  autoComplete: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-neutral-400">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        autoComplete={autoComplete}
        required
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 outline-none focus:border-sky-500"
      />
    </label>
  )
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-sky-500 px-3 py-2 font-medium text-neutral-950 transition hover:bg-sky-400 disabled:opacity-50"
    >
      {pending ? "…" : children}
    </button>
  )
}
