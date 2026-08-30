import { detectTimezone, timezoneList, timezoneOffsetLabel } from "@pace/validation"
import { usePowerSync, useQuery } from "@powersync/react-native"
import { useMemo, useState } from "react"
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native"
import { type Palette, useTheme, useThemedStyles } from "../theme"
import { setTimezone } from "./mutations"

const ALL_ZONES = timezoneList()

// "America/Toronto — GMT-4" so a user recognises the zone without knowing the IANA name.
function zoneLabel(zone: string): string {
  const offset = timezoneOffsetLabel(zone)
  return offset ? `${zone.replace(/_/g, " ")} — ${offset}` : zone.replace(/_/g, " ")
}

// The mobile Settings "Timezone" section (P2 Timezones) — twin of apps/web's TimezoneSettings.
// Auto-detects by default (see TimezoneSync); tapping the row pins a specific IANA zone (turning
// auto-detect off). The stored zone drives due/start-date calc + recurrence across the app.
export function TimezoneSection() {
  const db = usePowerSync()
  const styles = useThemedStyles(makeStyles)
  const { colors } = useTheme()
  const { data } = useQuery<{ id: string; timezone: string | null; timezone_auto: number }>(
    "SELECT id, timezone, timezone_auto FROM user_settings LIMIT 1",
  )
  const row = data[0]
  const auto = row ? row.timezone_auto !== 0 : true
  const current = row?.timezone ?? detectTimezone()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? ALL_ZONES.filter((z) => z.toLowerCase().includes(q)) : ALL_ZONES
    return list.slice(0, 200)
  }, [query])

  function pick(zone: string) {
    if (!row) return
    void setTimezone(db, row.id, zone, false) // pinning turns auto-detection off
    setOpen(false)
    setQuery("")
  }

  function toggleAuto(next: boolean) {
    if (!row) return
    void setTimezone(db, row.id, next ? detectTimezone() : current, next)
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Timezone</Text>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>Auto-detect</Text>
          <Text style={styles.hint}>Follow this device's timezone.</Text>
        </View>
        <Switch
          testID="timezone-auto"
          disabled={!row}
          value={auto}
          onValueChange={toggleAuto}
          trackColor={{ true: colors.primary }}
        />
      </View>

      <Pressable
        testID="timezone-row"
        style={styles.row}
        onPress={() => row && setOpen(true)}
        disabled={!row}
      >
        <Text style={styles.label}>Timezone</Text>
        <Text style={styles.value} numberOfLines={1}>
          {zoneLabel(current)}
        </Text>
      </Pressable>

      <Text style={styles.hint}>Used for due dates, start dates, and recurring tasks.</Text>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.pickerScreen}>
          <View style={styles.pickerHead}>
            <Text style={styles.pickerTitle}>Select timezone</Text>
            <Pressable testID="timezone-cancel" onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
          <TextInput
            testID="timezone-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search timezones…"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
          />
          <FlatList
            data={matches}
            keyExtractor={(z) => z}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                testID={`timezone-option-${item}`}
                style={styles.zoneRow}
                onPress={() => pick(item)}
              >
                <Text style={[styles.zoneText, item === current ? styles.zoneTextActive : null]}>
                  {zoneLabel(item)}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.hint}>No matches</Text>}
          />
        </View>
      </Modal>
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
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
    rowText: { flexShrink: 1 },
    label: { color: c.textSecondary, fontSize: 15 },
    hint: { color: c.textMuted, fontSize: 12 },
    value: { color: c.textPrimary, fontSize: 15, flexShrink: 1, textAlign: "right" },
    pickerScreen: { flex: 1, backgroundColor: c.background, padding: 16, gap: 12 },
    pickerHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 8,
    },
    pickerTitle: { color: c.textPrimary, fontSize: 18, fontWeight: "700" },
    cancel: { color: c.primary, fontSize: 15, fontWeight: "600" },
    search: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceInput,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: c.textPrimary,
      fontSize: 15,
    },
    zoneRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    zoneText: { color: c.textPrimary, fontSize: 15 },
    zoneTextActive: { color: c.primary, fontWeight: "600" },
  })
