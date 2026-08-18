import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Moon, Sun } from "lucide-react"
import { type FormEvent, type ReactNode, useEffect, useState } from "react"
import { AppLayout } from "#/components/app-layout"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { authClient, signOut, useSession, useTokens } from "#/lib/auth-client"
import { getConfig } from "#/lib/config"
import { StatusesSettings } from "#/lib/statuses/status-settings"
import { TagsSettings } from "#/lib/tags/tag-settings"
import { type Theme, useTheme } from "#/lib/theme"
import { useToast } from "#/lib/toast"
import { cn } from "#/lib/utils"

export const Route = createFileRoute("/settings")({ component: SettingsPage })

function SettingsPage() {
  return (
    <AppLayout>
      <Settings />
    </AppLayout>
  )
}

// Rendered inside AppLayout, so the session is guaranteed present. Account settings:
// an editable display name (persisted via Better Auth), read-only account/app info,
// and sign-out.
function Settings() {
  const { data: session } = useSession()
  const toast = useToast()
  const navigate = useNavigate()
  const config = getConfig()

  const currentName = session?.user.name ?? ""
  const email = session?.user.email ?? ""
  const initials = (currentName || email).slice(0, 2).toUpperCase() || "··"

  const [name, setName] = useState(currentName)
  const [baseline, setBaseline] = useState(currentName)
  const [saving, setSaving] = useState(false)

  // Sync when the session's name loads/changes (e.g. after a save elsewhere).
  useEffect(() => {
    setName(currentName)
    setBaseline(currentName)
  }, [currentName])

  const dirty = name.trim().length > 0 && name.trim() !== baseline

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!dirty || saving) return
    setSaving(true)
    const { error } = await authClient.updateUser({ name: name.trim() })
    setSaving(false)
    if (error) {
      toast.show("Couldn't save your name. Try again.")
      return
    }
    setBaseline(name.trim())
    toast.show("Display name saved.")
  }

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border px-8 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <Section title="Account">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {initials}
              </span>
              <div className="min-w-0">
                <div className="truncate font-medium">{currentName || "Your account"}</div>
                <div className="truncate text-sm text-muted-foreground">{email}</div>
              </div>
            </div>

            <form onSubmit={save} className="flex flex-col gap-1.5">
              <label htmlFor="display-name" className="text-sm text-muted-foreground">
                Display name
              </label>
              <div className="flex gap-2">
                <Input
                  id="display-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="flex-1"
                />
                <Button type="submit" disabled={!dirty || saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>

            <Row label="Email">
              <span className="text-muted-foreground">{email}</span>
            </Row>
          </Section>

          <Section title="Appearance">
            <Row label="Theme">
              <ThemeToggle />
            </Row>
          </Section>

          <StatusesSettings />

          <TagsSettings />

          <Section title="About">
            <Row label="App">Pace</Row>
            <Row label="Platform">
              <span className="text-muted-foreground">{useTokens ? "Desktop" : "Web"}</span>
            </Row>
            <Row label="API">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {config.apiUrl}
              </span>
            </Row>
            <Row label="Sync">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {config.powersyncUrl}
              </span>
            </Row>
          </Section>

          <div className="flex">
            <Button
              variant="outline"
              onClick={async () => {
                await signOut()
                navigate({ to: "/sign-in" })
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const options: { key: Theme; label: string; icon: ReactNode }[] = [
    { key: "dark", label: "Dark", icon: <Moon /> },
    { key: "light", label: "Light", icon: <Sun /> },
  ]
  return (
    <div className="flex gap-0.5 rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.key}
          onClick={() => setTheme(o.key)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors [&_svg]:size-3.5",
            theme === o.key
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-glow">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  )
}
