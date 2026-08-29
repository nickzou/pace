import { z } from "zod"

// Password policy ("Password rules"): at least 10 characters with an uppercase letter, a lowercase
// letter, a number, and a symbol. One source of truth shared by the API (server-side enforcement,
// so it can't be bypassed by hitting the endpoint directly) and the web/mobile sign-up forms (a
// live requirements checklist + submit gate). `passwordChecks` drives the checklist; `passwordSchema`
// is the zod form for server validation.
export const PASSWORD_MIN_LENGTH = 10

export const PASSWORD_MESSAGE =
  `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, ` +
  "a lowercase letter, a number, and a symbol."

export type PasswordCheck = { key: string; label: string; ok: boolean }

// Per-rule results in display order — for the sign-up requirements checklist.
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    {
      key: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      ok: password.length >= PASSWORD_MIN_LENGTH,
    },
    { key: "upper", label: "An uppercase letter", ok: /[A-Z]/.test(password) },
    { key: "lower", label: "A lowercase letter", ok: /[a-z]/.test(password) },
    { key: "number", label: "A number", ok: /[0-9]/.test(password) },
    { key: "symbol", label: "A symbol", ok: /[^A-Za-z0-9]/.test(password) },
  ]
}

export function isPasswordValid(password: string): boolean {
  return passwordChecks(password).every((c) => c.ok)
}

export const passwordSchema = z.string().refine(isPasswordValid, { message: PASSWORD_MESSAGE })
