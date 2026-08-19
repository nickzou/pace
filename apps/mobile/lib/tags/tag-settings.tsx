import { STATUS_COLORS } from "@pace/tokens"
import { usePowerSync, useQuery } from "@powersync/react-native"
import { useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { statusHex } from "../tasks/status-control"
import { type Palette, useTheme, useThemedStyles } from "../theme"
import { createTag, deleteTag, recolorTag, renameTag } from "./mutations"

type TagRow = { id: string; name: string; color: string; position: number }

// The mobile Settings tag-management section (P2-04) — twin of apps/web's TagsSettings.
// A flat list with create / rename / recolour / delete. Tags are always on (no toggle).
export function TagsSection() {
  const styles = useThemedStyles(makeStyles)
  const { data: tags } = useQuery<TagRow>(
    "SELECT id, name, color, position FROM tags ORDER BY position, created_at",
  )
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Tags</Text>
      {tags.length === 0 ? (
        <Text style={styles.hint}>No tags yet — add one below.</Text>
      ) : (
        tags.map((t) => <EditableTag key={t.id} tag={t} />)
      )}
      <AddTag nextPosition={tags.length} />
    </View>
  )
}

function EditableTag({ tag }: { tag: TagRow }) {
  const db = usePowerSync()
  const { scheme } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [name, setName] = useState(tag.name)
  const [picking, setPicking] = useState(false)
  useEffect(() => setName(tag.name), [tag.name])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== tag.name) void renameTag(db, tag.id, trimmed)
    else setName(tag.name)
  }

  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Pressable onPress={() => setPicking((p) => !p)} hitSlop={6}>
          <View style={[styles.dot, { backgroundColor: statusHex(tag.color, scheme) }]} />
        </Pressable>
        <TextInput value={name} onChangeText={setName} onBlur={saveName} style={styles.nameInput} />
        <Pressable onPress={() => void deleteTag(db, tag.id)} hitSlop={8}>
          <Text style={styles.del}>✕</Text>
        </Pressable>
      </View>
      {picking ? (
        <View style={styles.swatchRow}>
          {STATUS_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                void recolorTag(db, tag.id, c)
                setPicking(false)
              }}
              style={[
                styles.swatch,
                { backgroundColor: statusHex(c, scheme) },
                tag.color === c ? styles.swatchSel : null,
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

function AddTag({ nextPosition }: { nextPosition: number }) {
  const db = usePowerSync()
  const { scheme, colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [name, setName] = useState("")
  const [color, setColor] = useState<string>(STATUS_COLORS[0])

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    void createTag(db, trimmed, color, nextPosition)
    setName("")
  }

  return (
    <View style={styles.addBox}>
      <View style={styles.addRow}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="New tag…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          onSubmitEditing={add}
        />
        <Pressable onPress={add} disabled={!name.trim()} style={styles.addBtn}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
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
    hint: { color: c.textSecondary, fontSize: 14 },
    item: { gap: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    nameInput: { color: c.textPrimary, fontSize: 14, flex: 1, paddingVertical: 2 },
    del: { color: c.dangerText, fontSize: 13 },
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
    swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    swatch: { width: 24, height: 24, borderRadius: 12 },
    swatchSel: { borderWidth: 2, borderColor: c.textPrimary },
  })
