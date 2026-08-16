import { color, fontSize, fontWeight, radius, space } from "@pace/tokens"
import type { ReactNode } from "react"
import { Pressable, type PressableProps, StyleSheet, Text, type ViewStyle } from "react-native"

// The RN twin of the web shadcn Button — same variants/sizes, styled from
// @pace/tokens (no Tailwind on native). Children are a text label.
type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive"
type Size = "default" | "sm" | "lg"

type Props = Omit<PressableProps, "children" | "style"> & {
  children: ReactNode
  variant?: Variant
  size?: Size
  style?: ViewStyle
}

export function Button({
  children,
  variant = "default",
  size = "default",
  disabled,
  style,
  ...props
}: Props) {
  const v = variants[variant]
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        v.container,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
      {...props}
    >
      <Text style={[styles.label, textSizeStyles[size], { color: v.labelColor }]}>{children}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "transparent",
  },
  pressed: { opacity: 0.9 },
  disabled: { opacity: 0.5 },
  label: { fontWeight: fontWeight.medium },
})

const sizeStyles = StyleSheet.create({
  default: { height: 40, paddingHorizontal: space[4] },
  sm: { height: 32, paddingHorizontal: space[3] },
  lg: { height: 44, paddingHorizontal: space[6] },
})

const textSizeStyles = StyleSheet.create({
  default: { fontSize: fontSize.sm },
  sm: { fontSize: fontSize.xs },
  lg: { fontSize: fontSize.base },
})

const variants: Record<Variant, { container: ViewStyle; labelColor: string }> = {
  default: { container: { backgroundColor: color.primary }, labelColor: color.onPrimary },
  secondary: { container: { backgroundColor: color.surface }, labelColor: color.textPrimary },
  outline: {
    container: { backgroundColor: color.background, borderColor: color.borderStrong },
    labelColor: color.textPrimary,
  },
  ghost: { container: { backgroundColor: "transparent" }, labelColor: color.textPrimary },
  destructive: { container: { backgroundColor: color.danger }, labelColor: color.textPrimary },
}
