import { useTRPCClient } from "@pace/api-client"
import { DELETE_CONFIRMATION } from "@pace/validation"
import { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { type Palette, useThemedStyles } from "../theme"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Modal, ModalDescription, ModalTitle } from "../ui/modal"

// Delete Account confirm modal — the mobile twin of the web dialog. Reauth-gated (password + typed
// confirmation) → account.requestDeletion arms the 30-day grace period (server revokes every
// session). On success `onDeleted` runs the app's sign-out (clears SecureStore + local DB and
// returns to the auth screen); signing back in within the window cancels the deletion.
export function DeleteAccountDialog({
  visible,
  onClose,
  onDeleted,
}: {
  visible: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const trpc = useTRPCClient()
  const styles = useThemedStyles(makeStyles)
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
    onDeleted()
  }

  return (
    <Modal visible={visible} onClose={onClose}>
      <ModalTitle>Delete account</ModalTitle>
      <ModalDescription>
        Your account will be scheduled for deletion and you'll be signed out on every device. You
        have 30 days to cancel by signing back in — after that, your data is permanently erased.
      </ModalDescription>

      <View style={styles.field}>
        <Text style={styles.label}>Confirm your password</Text>
        <Input
          testID="delete-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Type {DELETE_CONFIRMATION} to confirm</Text>
        <Input
          testID="delete-confirm"
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button variant="outline" onPress={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          testID="delete-confirm-btn"
          variant="destructive"
          onPress={onConfirm}
          disabled={!canDelete}
        >
          {busy ? "Deleting…" : "Delete account"}
        </Button>
      </View>
    </Modal>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    field: { gap: 6, marginTop: 14 },
    label: { color: c.textSecondary, fontSize: 13 },
    error: { color: c.danger, fontSize: 13, marginTop: 10 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  })
