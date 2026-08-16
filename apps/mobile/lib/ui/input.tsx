import { color, fontSize, radius, space } from "@pace/tokens"
import { StyleSheet, TextInput, type TextInputProps } from "react-native"

// The RN twin of the web shadcn Input — a TextInput styled from @pace/tokens.
export function Input({ style, ...props }: TextInputProps) {
  return (
    <TextInput placeholderTextColor={color.textFaint} style={[styles.input, style]} {...props} />
  )
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.surfaceInput,
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    color: color.textPrimary,
    fontSize: fontSize.sm,
  },
})
