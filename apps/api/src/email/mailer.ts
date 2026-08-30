import { createTransport, type Transporter } from "nodemailer"
import { env } from "../env"

// One SMTP client for the whole app. Provider is decided entirely by env, so the
// code path is identical everywhere: Mailpit in dev/CI/preview (no auth), Resend
// in prod (smtp.resend.com, user "resend", pass = RESEND_API_KEY). Nothing here
// is provider-specific — swap providers by changing SMTP_* env vars.
let transporter: Transporter | null = null

function getTransport(): Transporter {
  if (transporter) return transporter
  transporter = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Mailpit listens plaintext on 1025; Resend uses STARTTLS on 587. `secure`
    // is only for implicit TLS (465), so leave it off and let nodemailer upgrade.
    secure: false,
    // Mailpit takes no credentials; only authenticate when both are provided.
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  })
  return transporter
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text: string
}

// The single send primitive every feature calls. Kept intentionally small so the
// transport (and thus the provider) stays swappable behind it.
export async function sendEmail(message: EmailMessage): Promise<void> {
  await getTransport().sendMail({ from: env.EMAIL_FROM, ...message })
}
