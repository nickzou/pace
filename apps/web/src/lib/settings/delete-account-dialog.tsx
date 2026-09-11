import { useTRPCClient } from "@pace/api-client"
import { DELETE_CONFIRMATION } from "@pace/validation"
import { Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "#/components/ui/dialog"
import { Input } from "#/components/ui/input"
import { signOut } from "#/lib/auth-client"
import { useToast } from "#/lib/toast"

// The Delete Account confirm modal (web + desktop — desktop reuses this UI, and signOut() handles
// the bearer-token path). Reauth-gated: password + typed confirmation, mirroring the server's
// requestDeletion. On success the account enters the 30-day grace period (server revokes every
// session), so we sign out locally and send the user to sign-in — where logging back in cancels it.
export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trpc = useTRPCClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const canDelete = password.length > 0 && confirm === DELETE_CONFIRMATION && !busy

  async function onConfirm() {
    if (!canDelete) return
    setBusy(true)
    setError("")
    try {
      await trpc.account.requestDeletion.mutate({ password, confirmation: DELETE_CONFIRMATION })
    } catch (err) {
      setBusy(false)
      const message = err instanceof Error ? err.message : ""
      setError(
        /password/i.test(message)
          ? "Incorrect password."
          : "Couldn't delete the account. Try again.",
      )
      return
    }
    // Armed server-side (sessions revoked). Clear local SQLite + token, then to sign-in.
    await signOut().catch(() => {})
    toast.show("Account scheduled for deletion. Sign in within 30 days to cancel.")
    navigate({ to: "/sign-in" })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Delete account</DialogTitle>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your account will be <strong>scheduled for deletion</strong> and you'll be signed out on
            every device. You have <strong>30 days</strong> to cancel by signing back in — after
            that, your tasks and all data are permanently erased.
          </p>
          <p className="text-sm text-muted-foreground">
            Want a copy first?{" "}
            <Link
              to="/settings"
              search={{ tab: "data" }}
              onClick={onClose}
              className="text-primary hover:underline"
            >
              Export your data
            </Link>{" "}
            before you go.
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="del-password" className="text-sm text-muted-foreground">
              Confirm your password
            </label>
            <Input
              id="del-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="del-confirm" className="text-sm text-muted-foreground">
              Type{" "}
              <span className="font-mono font-semibold text-foreground">{DELETE_CONFIRMATION}</span>{" "}
              to confirm
            </label>
            <Input
              id="del-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={!canDelete}>
              {busy ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
