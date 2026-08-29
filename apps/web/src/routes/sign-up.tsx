import { isPasswordValid, passwordChecks } from "@pace/validation"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Check, Circle, Eye, EyeOff } from "lucide-react"
import { type FormEvent, useState } from "react"
import { signUp } from "#/lib/auth-client"
import { cn } from "#/lib/utils"

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
        <Link to="/sign-in" className="text-primary hover:underline">
          Already have an account? Sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Name" value={name} onChange={setName} type="text" autoComplete="name" />
        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          showChecklist
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <SubmitButton pending={pending} disabled={!isPasswordValid(password)}>
          Sign up
        </SubmitButton>
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
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          ← Pace
        </Link>
        <h1 className="mt-4 mb-6 text-2xl font-semibold">{title}</h1>
        <div className="rounded-xl border border-border bg-card p-6">{children}</div>
        <p className="mt-4 text-sm text-muted-foreground">{footer}</p>
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
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        autoComplete={autoComplete}
        required
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground outline-none focus:border-ring"
      />
    </label>
  )
}

// Password input with a show/hide "peek" toggle. On sign-up (showChecklist) it also renders the
// live requirements checklist from the shared policy (@pace/validation); sign-in just gets the peek.
export function PasswordField({
  label = "Password",
  value,
  onChange,
  autoComplete,
  showChecklist = false,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  showChecklist?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
        <div className="relative">
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            type={show ? "text" : "password"}
            autoComplete={autoComplete}
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 pr-10 text-foreground outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>
      {showChecklist ? (
        <ul className="mt-2 space-y-1">
          {passwordChecks(value).map((c) => (
            <li
              key={c.key}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                c.ok ? "text-primary" : "text-muted-foreground",
              )}
            >
              {c.ok ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
              {c.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function SubmitButton({
  pending,
  disabled,
  children,
}: {
  pending: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
    >
      {pending ? "…" : children}
    </button>
  )
}
