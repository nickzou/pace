import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { signIn } from "#/lib/auth-client"
import { AuthShell, CheckYourEmail, Field, PasswordField, SubmitButton } from "./sign-up"

export const Route = createFileRoute("/sign-in")({ component: SignIn })

function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // Better Auth blocks sign-in for an unverified account (403). Swap in the
  // verify prompt (which resends the link) rather than a dead-end error.
  const [needsVerification, setNeedsVerification] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await signIn.email({ email, password })
    setPending(false)
    if (result.error) {
      if (result.error.status === 403) {
        setNeedsVerification(true)
        return
      }
      setError(result.error.message ?? "Could not sign in")
      return
    }
    navigate({ to: "/" })
  }

  if (needsVerification) {
    return <CheckYourEmail email={email} title="Verify your email" />
  }

  return (
    <AuthShell
      title="Sign in"
      footer={
        <Link to="/sign-up" className="text-primary hover:underline">
          Need an account? Sign up
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" value={email} onChange={setEmail} type="email" autoComplete="email" />
        <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </form>
    </AuthShell>
  )
}
