import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { type Palette, type ThemePref, useTheme, useThemedStyles } from "../theme"

// The mobile settings screen — the twin of apps/web's /settings route. There's no
// navigator on native, so (like the task detail view) this is a full-screen Modal,
// opened from the signed-in home. Sections mirror the web: Account + Appearance.
const THEME_OPTIONS: { key: ThemePref; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
]

export function SettingsModal({
  visible,
  email,
  onClose,
}: {
  visible: boolean
  email: string
  onClose: () => void
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {visible ? <SettingsBody email={email} onClose={onClose} /> : null}
    </Modal>
  )
}

function SettingsBody({ email, onClose }: { email: string; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles)
  const { pref, setPref } = useTheme()

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable testID="settings-close" onPress={onClose} hitSlop={8}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Signed in as</Text>
            <Text style={styles.value} numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Theme</Text>
            <View style={styles.segment}>
              {THEME_OPTIONS.map((o) => {
                const active = pref === o.key
                return (
                  <Pressable
                    key={o.key}
                    testID={`theme-${o.key}`}
                    onPress={() => setPref(o.key)}
                    style={[styles.segmentBtn, active ? styles.segmentBtnActive : null]}
                  >
                    <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                      {o.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    container: { padding: 24, paddingTop: 64, gap: 20 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: "700" },
    done: { color: c.primary, fontSize: 15, fontWeight: "600" },
    section: {
      gap: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 16,
    },
    sectionTitle: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    label: { color: c.textSecondary, fontSize: 15, flexShrink: 0 },
    value: { color: c.textPrimary, fontSize: 15, flexShrink: 1, textAlign: "right" },
    segment: {
      flexDirection: "row",
      gap: 2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      padding: 2,
    },
    segmentBtn: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
    segmentBtnActive: { backgroundColor: c.primary },
    segmentText: { color: c.textSecondary, fontSize: 13, fontWeight: "500" },
    segmentTextActive: { color: c.onPrimary },
  })
