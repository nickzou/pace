import { STATUS_COLORS } from "@pace/tokens"
import { usePowerSync, useQuery } from "@powersync/react-native"
import { useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { statusHex } from "../tasks/status-control"
import { type Palette, useTheme, useThemedStyles } from "../theme"
import {
  createGroup,
  createStatus,
  deleteGroup,
  deleteStatus,
  setCustomStatusesEnabled,
} from "./mutations"

type GroupRow = { id: string; name: string; is_default: number }
type StatusRow = {
  id: string
  group_id: string
  name: string
  color: string
  category: string
  is_system: number
}

const CATEGORIES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
]

// The mobile Settings status-management section (P2-03) — twin of apps/web's
// StatusesSettings. Enable toggle, then per-group status CRUD. Delete affordances are
// hidden for the default group and system statuses (the server also protects them).
export function StatusesSection() {
  const db = usePowerSync()
  const styles = useThemedStyles(makeStyles)
  const { data: settingsRows } = useQuery<{ id: string; custom_statuses_enabled: number }>(
    "SELECT id, custom_statuses_enabled FROM user_settings LIMIT 1",
  )
  const settings = settingsRows[0]
  const enabled = !!settings?.custom_statuses_enabled
  const { data: groups } = useQuery<GroupRow>(
    "SELECT id, name, is_default FROM status_groups ORDER BY position, created_at",
  )
  const { data: statuses } = useQuery<StatusRow>(
    "SELECT id, group_id, name, color, category, is_system FROM statuses ORDER BY position",
  )

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Statuses</Text>
        <Pressable
          testID="statuses-toggle"
          disabled={!settings}
          onPress={() => settings && void setCustomStatusesEnabled(db, settings.id, !enabled)}
          style={[styles.switch, enabled ? styles.switchOn : null]}
        >
          <View style={[styles.knob, enabled ? styles.knobOn : styles.knobOff]} />
        </Pressable>
      </View>

      {enabled ? (
        <View style={styles.groups}>
          {groups.map((g) => (
            <GroupBlock
              key={g.id}
              group={g}
              statuses={statuses.filter((s) => s.group_id === g.id)}
            />
          ))}
          <NewGroup nextPosition={groups.length} />
        </View>
      ) : (
        <Text style={styles.hint}>Turn this on to define your own statuses and lists.</Text>
      )}
    </View>
  )
}

function GroupBlock({ group, statuses }: { group: GroupRow; statuses: StatusRow[] }) {
  const db = usePowerSync()
  const styles = useThemedStyles(makeStyles)
  const { scheme } = useTheme()
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text style={styles.groupName}>
          {group.name}
          {group.is_default ? "  · default" : ""}
        </Text>
        {group.is_default ? null : (
          <Pressable onPress={() => void deleteGroup(db, group.id)} hitSlop={6}>
            <Text style={styles.del}>Delete</Text>
          </Pressable>
        )}
      </View>
      {statuses.map((s) => (
        <View key={s.id} style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusHex(s.color, scheme) }]} />
          <Text style={styles.statusName} numberOfLines={1}>
            {s.name}
          </Text>
          <Text style={styles.cat}>{s.category.replace("_", " ")}</Text>
          {s.is_system ? null : (
            <Pressable onPress={() => void deleteStatus(db, s.id)} hitSlop={8}>
              <Text style={styles.del}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}
      <AddStatus groupId={group.id} nextPosition={statuses.length} />
    </View>
  )
}

function AddStatus({ groupId, nextPosition }: { groupId: string; nextPosition: number }) {
  const db = usePowerSync()
  const styles = useThemedStyles(makeStyles)
  const { scheme, colors } = useTheme()
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(STATUS_COLORS[0])
  const [category, setCategory] = useState("open")
  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    void createStatus(db, groupId, trimmed, color, category, nextPosition)
    setName("")
  }
  return (
    <View style={styles.addBox}>
      <View style={styles.addRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="New status…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          onSubmitEditing={add}
        />
        <Pressable onPress={add} disabled={!name.trim()} style={styles.addBtn}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>
      <View style={styles.catRow}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => setCategory(c.value)}
            style={[styles.catBtn, category === c.value ? styles.catBtnActive : null]}
          >
            <Text style={[styles.catText, category === c.value ? styles.catTextActive : null]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.swatchRow}>
        {STATUS_COLORS.map((cc) => (
          <Pressable
            key={cc}
            onPress={() => setColor(cc)}
            style={[
              styles.swatch,
              { backgroundColor: statusHex(cc, scheme) },
              color === cc ? styles.swatchSel : null,
            ]}
          />
        ))}
      </View>
    </View>
  )
}

function NewGroup({ nextPosition }: { nextPosition: number }) {
  const db = usePowerSync()
  const styles = useThemedStyles(makeStyles)
  const { colors } = useTheme()
  const [name, setName] = useState("")
  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    void createGroup(db, trimmed, nextPosition)
    setName("")
  }
  return (
    <View style={styles.addRow}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="New status list…"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        onSubmitEditing={add}
      />
      <Pressable onPress={add} disabled={!name.trim()} style={styles.addBtn}>
        <Text style={styles.addBtnText}>Add list</Text>
      </Pressable>
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
    sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionTitle: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    switch: {
      width: 44,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.borderStrong,
      padding: 2,
    },
    switchOn: { backgroundColor: c.primary },
    knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.background },
    knobOff: { alignSelf: "flex-start" },
    knobOn: { alignSelf: "flex-end" },
    hint: { color: c.textSecondary, fontSize: 14 },
    groups: { gap: 16 },
    group: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 10, gap: 8 },
    groupHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    groupName: { color: c.textPrimary, fontSize: 14, fontWeight: "600" },
    del: { color: c.dangerText, fontSize: 13 },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    statusName: { color: c.textPrimary, fontSize: 14, flex: 1 },
    cat: { color: c.textMuted, fontSize: 12 },
    addBox: { gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 },
    addRow: { flexDirection: "row", gap: 8 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceInput,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: c.textPrimary,
      fontSize: 14,
    },
    addBtn: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    addBtnText: { color: c.onPrimary, fontWeight: "600", fontSize: 14 },
    catRow: { flexDirection: "row", gap: 6 },
    catBtn: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    catBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    catText: { color: c.textSecondary, fontSize: 12 },
    catTextActive: { color: c.onPrimary },
    swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    swatch: { width: 24, height: 24, borderRadius: 12 },
    swatchSel: { borderWidth: 2, borderColor: c.textPrimary },
  })
