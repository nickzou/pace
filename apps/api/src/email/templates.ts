import type { EmailMessage } from "./mailer"

// The verification email. Plain, dependency-free HTML (inlined styles) so it
// renders in any client; a text/plain fallback ships alongside for the rest.
export function verificationEmail(to: string, verifyUrl: string): EmailMessage {
  return {
    to,
    subject: "Verify your email for Pace",
    text: [
      "Welcome to Pace!",
      "",
      "Confirm your email address to finish setting up your account:",
      verifyUrl,
      "",
      "If you didn't create a Pace account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
        <h1 style="font-size: 20px; margin: 0 0 16px;">Welcome to Pace!</h1>
        <p style="margin: 0 0 16px; line-height: 1.5;">Confirm your email address to finish setting up your account.</p>
        <p style="margin: 0 0 24px;">
          <a href="${verifyUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">Verify email</a>
        </p>
        <p style="margin: 0 0 8px; font-size: 13px; color: #666;">Or paste this link into your browser:</p>
        <p style="margin: 0 0 24px; font-size: 13px; word-break: break-all;"><a href="${verifyUrl}" style="color: #2563eb;">${verifyUrl}</a></p>
        <p style="margin: 0; font-size: 13px; color: #666;">If you didn't create a Pace account, you can ignore this email.</p>
      </div>
    `.trim(),
  }
}
