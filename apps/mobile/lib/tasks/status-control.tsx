import { type StatusColor, statusColor, statusColorLight } from "@pace/tokens"
import { useState } from "react"
import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { type Palette, useTheme, useThemedStyles } from "../theme"

// A status as the UI reads it from local SQLite.
export type StatusOption = { id: string; name: string; color: string; category: string }

// Resolve a palette key to a hex for the active scheme (P2-03 statusPalette).
export function statusHex(key: string, scheme: "dark" | "light"): string {
  const map = scheme === "light" ? statusColorLight : statusColor
  return map[key as StatusColor] ?? map.slate
}

// The mobile status control: a compact coloured icon (list) or a coloured pill with the
// label (detail) that opens a modal picker of the task's group statuses. (Web uses an
// inline chip + dropdown — see apps/web.)
export function StatusControl({
  current,
  options,
  onSelect,
  showLabel = false,
}: {
  current: StatusOption | undefined
  options: StatusOption[]
  onSelect: (statusId: string) => void
  showLabel?: boolean
}) {
  const { scheme } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const color = statusHex(current?.color ?? "slate", scheme)

  return (
    <>
      <Pressable
        testID="status-control"
        onPress={() => setOpen(true)}
        hitSlop={8}
        style={showLabel ? [styles.pill, { backgroundColor: color }] : undefined}
      >
        {showLabel ? (
          <Text style={styles.pillText} numberOfLines={1}>
            {current?.name ?? "—"}
          </Text>
        ) : (
          <View style={[styles.dot, { backgroundColor: color }]} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menu}>
            {options.map((o) => (
              <Pressable
                key={o.id}
                testID={`status-option-${o.id}`}
                onPress={() => {
                  onSelect(o.id)
                  setOpen(false)
                }}
                style={styles.menuRow}
              >
                <View style={[styles.dot, { backgroundColor: statusHex(o.color, scheme) }]} />
                <Text style={styles.menuText} numberOfLines={1}>
                  {o.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    pillText: { color: "#fff", fontSize: 12, fontWeight: "600", maxWidth: 180 },
    dot: { width: 14, height: 14, borderRadius: 7 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      padding: 32,
    },
    menu: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 6,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    menuText: { color: c.textPrimary, fontSize: 15, flexShrink: 1 },
  })
