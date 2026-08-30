import { usePowerSync } from "@powersync/react-native"
import { useEffect, useState } from "react"
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native"
import { authClient, useSession } from "../auth-client"
import { StatusesSection } from "../statuses/status-settings"
import { TimezoneSection } from "../statuses/timezone-settings"
import { TagsSection } from "../tags/tag-settings"
import { type Palette, type ThemePref, useTheme, useThemedStyles } from "../theme"

// The mobile settings screen — the twin of apps/web's tabbed /settings. A full-screen Modal with a
// vertical tab rail on the left and the active section's content on the right (web parity).
const TABS = [
  { key: "account", label: "Account" },
  { key: "general", label: "General" },
  { key: "notifications", label: "Notifications" },
  { key: "subscriptions", label: "Subscriptions" },
  { key: "theme", label: "Theme" },
  { key: "sidebar", label: "Sidebar" },
  { key: "task-defaults", label: "Task Defaults" },
  { key: "data", label: "Data" },
] as const

type TabKey = (typeof TABS)[number]["key"]

const THEME_OPTIONS: { key: ThemePref; label: string }[] = [
  { key: "system", label: "System" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
]

const EXPORT_TABLES = ["tasks", "status_groups", "statuses", "tags", "task_tags", "user_settings"]

export function SettingsModal({
  visible,
  email,
  onClose,
  onSignOut,
}: {
  visible: boolean
  email: string
  onClose: () => void
  onSignOut: () => void
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {visible ? <SettingsBody email={email} onClose={onClose} onSignOut={onSignOut} /> : null}
    </Modal>
  )
}

function SettingsBody({
  email,
  onClose,
  onSignOut,
}: {
  email: string
  onClose: () => void
  onSignOut: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const [tab, setTab] = useState<TabKey>("account")

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Pressable testID="settings-close" onPress={onClose} hitSlop={8}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <ScrollView style={styles.rail} contentContainerStyle={styles.railContent}>
          {TABS.map((t) => {
            const active = t.key === tab
            return (
              <Pressable
                key={t.key}
                testID={`settings-tab-${t.key}`}
                onPress={() => setTab(t.key)}
                style={[styles.tab, active ? styles.tabActive : null]}
              >
                <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
                  {t.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {tab === "account" ? <AccountTab email={email} onSignOut={onSignOut} /> : null}
          {tab === "general" ? <GeneralTab /> : null}
          {tab === "notifications" ? (
            <StubTab title="Notifications" message="Notification settings are coming soon." />
          ) : null}
          {tab === "subscriptions" ? (
            <StubTab title="Subscriptions" message="Nothing here yet." />
          ) : null}
          {tab === "theme" ? <ThemeTab /> : null}
          {tab === "sidebar" ? (
            <StubTab title="Sidebar" message="Sidebar customisation is coming soon." />
          ) : null}
          {tab === "task-defaults" ? (
            <>
              <StatusesSection />
              <TagsSection />
            </>
          ) : null}
          {tab === "data" ? <DataTab /> : null}
        </ScrollView>
      </View>
    </View>
  )
}

function AccountTab({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const styles = useThemedStyles(makeStyles)
  const { colors } = useTheme()
  const { data: session } = useSession()
  const currentName = session?.user.name ?? ""
  const [name, setName] = useState(currentName)
  const [baseline, setBaseline] = useState(currentName)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(currentName)
    setBaseline(currentName)
  }, [currentName])

  const dirty = name.trim().length > 0 && name.trim() !== baseline

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    const { error } = await authClient.updateUser({ name: name.trim() })
    setSaving(false)
    if (!error) setBaseline(name.trim())
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Display name</Text>
        <View style={styles.fieldRow}>
          <TextInput
            testID="display-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          <Pressable
            testID="display-name-save"
            onPress={save}
            disabled={!dirty || saving}
            style={[styles.btn, !dirty || saving ? styles.btnDisabled : null]}
          >
            <Text style={styles.btnText}>{saving ? "…" : "Save"}</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value} numberOfLines={1}>
          {email}
        </Text>
      </View>
      <Pressable testID="settings-sign-out" onPress={onSignOut} style={styles.outlineBtn}>
        <Text style={styles.outlineBtnText}>Sign out</Text>
      </Pressable>
    </View>
  )
}

function GeneralTab() {
  const styles = useThemedStyles(makeStyles)
  return (
    <>
      <TimezoneSection />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.row}>
          <Text style={styles.label}>App</Text>
          <Text style={styles.value}>Pace</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Platform</Text>
          <Text style={styles.value}>Mobile</Text>
        </View>
      </View>
    </>
  )
}

function ThemeTab() {
  const styles = useThemedStyles(makeStyles)
  const { pref, setPref } = useTheme()
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Theme</Text>
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
  )
}

function DataTab() {
  const styles = useThemedStyles(makeStyles)
  const db = usePowerSync()
  const [busy, setBusy] = useState(false)

  async function onExport() {
    setBusy(true)
    try {
      const tables: Record<string, unknown[]> = {}
      for (const table of EXPORT_TABLES) {
        tables[table] = await db.getAll(`SELECT * FROM ${table}`)
      }
      const json = JSON.stringify({ tables }, null, 2)
      await Share.share({ message: json })
    } catch {
      // user cancelled the share sheet, or the query failed — nothing to do
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Data</Text>
      <Text style={styles.hint}>Share a copy of your tasks, statuses, and tags as JSON.</Text>
      <Pressable
        testID="export-data"
        onPress={onExport}
        disabled={busy}
        style={[styles.outlineBtn, busy ? styles.btnDisabled : null]}
      >
        <Text style={styles.outlineBtnText}>{busy ? "Exporting…" : "Export data (JSON)"}</Text>
      </Pressable>
    </View>
  )
}

function StubTab({ title, message }: { title: string; message: string }) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.hint}>{message}</Text>
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background, paddingTop: 56 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: "700" },
    done: { color: c.primary, fontSize: 15, fontWeight: "600" },
    body: { flex: 1, flexDirection: "row" },
    rail: { width: 124, borderRightWidth: 1, borderRightColor: c.border },
    railContent: { padding: 8, gap: 2 },
    tab: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
    tabActive: { backgroundColor: c.surface },
    tabText: { color: c.textSecondary, fontSize: 13 },
    tabTextActive: { color: c.textPrimary, fontWeight: "600" },
    content: { flex: 1 },
    contentInner: { padding: 16, gap: 16 },
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
    hint: { color: c.textSecondary, fontSize: 14 },
    field: { gap: 6 },
    fieldRow: { flexDirection: "row", gap: 8 },
    label: { color: c.textSecondary, fontSize: 15 },
    value: { color: c.textPrimary, fontSize: 15, flexShrink: 1, textAlign: "right" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceInput,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: c.textPrimary,
      fontSize: 15,
    },
    btn: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    btnDisabled: { opacity: 0.5 },
    btnText: { color: c.onPrimary, fontWeight: "600", fontSize: 14 },
    outlineBtn: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: "center",
    },
    outlineBtnText: { color: c.textPrimary, fontWeight: "600", fontSize: 14 },
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
