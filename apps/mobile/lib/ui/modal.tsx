import { color, fontSize, fontWeight, radius, space } from "@pace/tokens"
import type { ReactNode } from "react"
import { Pressable, Modal as RNModal, StyleSheet, Text, type TextStyle } from "react-native"

// The RN twin of the web shadcn Dialog — a centred card over a scrim, built on RN's
// Modal. Tap the scrim (or call onClose) to dismiss; the content absorbs its own
// taps. Styled from @pace/tokens.
export function Modal({
  visible,
  onClose,
  children,
}: {
  visible: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Absorb taps so pressing the card doesn't dismiss the modal. */}
        <Pressable style={styles.content} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  )
}

export function ModalTitle({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.title, style]}>{children}</Text>
}

export function ModalDescription({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.description, style]}>{children}</Text>
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: space[6],
  },
  content: {
    width: "100%",
    maxWidth: 480,
    gap: space[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    padding: space[6],
  },
  title: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: color.textPrimary },
  description: { fontSize: fontSize.sm, color: color.textSecondary },
})
