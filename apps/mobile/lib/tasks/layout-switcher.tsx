import { Pressable, StyleSheet, Text, View } from "react-native"
import { type Palette, useThemedStyles } from "../theme"
import { LAYOUTS, type Layout } from "./filter"

// The Multiview switcher (P2-07): a segmented control that flips the presentation layout
// (list / calendar / board). Purely a state setter — the caller owns the value.
const LABELS: Record<Layout, string> = { list: "List", calendar: "Calendar", board: "Board" }

export function LayoutSwitcher({
  current,
  onChange,
}: {
  current: Layout
  onChange: (layout: Layout) => void
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {LAYOUTS.map((l) => {
        const active = l === current
        return (
          <Pressable
            key={l}
            testID={`layout-${l}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(l)}
            style={[styles.seg, active ? styles.segActive : null]}
          >
            <Text style={[styles.segText, active ? styles.segTextActive : null]}>{LABELS[l]}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignSelf: "flex-start",
      gap: 2,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 10,
      padding: 2,
    },
    seg: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
    segActive: { backgroundColor: c.surfaceInput },
    segText: { color: c.textSecondary, fontSize: 13, fontWeight: "500" },
    segTextActive: { color: c.textPrimary, fontWeight: "600" },
  })
