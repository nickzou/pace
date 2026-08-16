import { color, fontSize, fontWeight, radius, space } from "@pace/tokens"
import type { ReactNode } from "react"
import { StyleSheet, Text, type TextStyle, View, type ViewProps } from "react-native"

// The RN twin of the web shadcn Card — a bordered surface plus title/description
// text helpers, styled from @pace/tokens.
export function Card({ children, style, ...props }: ViewProps & { children?: ReactNode }) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  )
}

export function CardTitle({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.title, style]}>{children}</Text>
}

export function CardDescription({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.description, style]}>{children}</Text>
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space[6],
    gap: space[2],
  },
  title: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: color.textPrimary },
  description: { fontSize: fontSize.sm, color: color.textSecondary },
})
