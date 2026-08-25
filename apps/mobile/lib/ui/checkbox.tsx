import { color, radius } from "@pace/tokens"
import { Check } from "lucide-react-native"
import { Pressable, StyleSheet, type ViewStyle } from "react-native"

// The RN twin of the web shadcn Checkbox — RN has no native checkbox, so this is a
// Pressable box with a Lucide check when checked (matching the app's existing checkbox look).
export function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  style,
}: {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  style?: ViewStyle
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onCheckedChange?.(!checked)}
      style={[
        styles.box,
        checked ? styles.checked : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {checked ? <Check size={14} color={color.onPrimary} strokeWidth={3} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: color.primary },
  disabled: { opacity: 0.5 },
})
