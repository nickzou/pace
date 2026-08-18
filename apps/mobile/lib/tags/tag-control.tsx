import { STATUS_COLORS } from "@pace/tokens"
import { usePowerSync } from "@powersync/react"
import { useEffect, useState } from "react"
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { assignTag, createTag, recolorTag, renameTag, unassignTag } from "../tags/mutations"
import { statusHex } from "../tasks/status-control"
import { type Palette, useTheme, useThemedStyles } from "../theme"

export type TagOption = { id: string; name: string; color: string }

// A task's tags as pills — the mobile twin of apps/web's TagChips. Each chip opens a small
// edit modal (rename + recolour + remove). Overflow beyond `max` collapses to a +k chip.
export function TagChips({
  tags,
  taskId,
  max = 3,
}: {
  tags: TagOption[]
  taskId?: string
  max?: number
}) {
  const styles = useThemedStyles(makeStyles)
  if (tags.length === 0) return null
  const shown = tags.slice(0, max)
  const extra = tags.length - shown.length
  return (
    <View style={styles.chipRow}>
      {shown.map((t) => (
        <EditableChip key={t.id} tag={t} taskId={taskId} />
      ))}
      {extra > 0 ? <Text style={styles.extra}>+{extra}</Text> : null}
    </View>
  )
}

// One chip → a modal to rename / recolour the tag (and remove it from the task).
function EditableChip({ tag, taskId }: { tag: TagOption; taskId?: string }) {
  const db = usePowerSync()
  const { scheme } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(tag.name)
  useEffect(() => setName(tag.name), [tag.name])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== tag.name) void renameTag(db, tag.id, trimmed)
    else setName(tag.name)
  }

  return (
    <>
      <Pressable
        testID={`tag-chip-${tag.name}`}
        onPress={() => setOpen(true)}
        style={[styles.chip, { backgroundColor: statusHex(tag.color, scheme) }]}
      >
        <Text style={styles.chipText} numberOfLines={1}>
          {tag.name}
        </Text>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          saveName()
          setOpen(false)
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            saveName()
            setOpen(false)
          }}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <TextInput
              testID={`tag-name-${tag.name}`}
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              placeholder="Tag name"
              style={styles.editInput}
            />
            <View style={styles.swatchRow}>
              {STATUS_COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => void recolorTag(db, tag.id, c)}
                  style={[
                    styles.swatch,
                    { backgroundColor: statusHex(c, scheme) },
                    tag.color === c ? styles.swatchSel : null,
                  ]}
                />
              ))}
            </View>
            {taskId ? (
              <Pressable
                onPress={() => {
                  if (taskId) void unassignTag(db, taskId, tag.id)
                  setOpen(false)
                }}
              >
                <Text style={styles.remove}>Remove from task</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

// Assign/unassign tags on a task, with inline create-and-assign. Editing a tag's name/
// colour lives on the chips + in Settings.
export function TagPicker({
  taskId,
  assignedIds,
  allTags,
  nextPosition,
}: {
  taskId: string
  assignedIds: Set<string>
  allTags: TagOption[]
  nextPosition: number
}) {
  const db = usePowerSync()
  const { scheme, colors } = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState("")

  const toggle = (id: string) => {
    if (assignedIds.has(id)) void unassignTag(db, taskId, id)
    else void assignTag(db, taskId, id)
  }
  const createAndAssign = async () => {
    const name = newName.trim()
    if (!name) return
    const color = STATUS_COLORS[nextPosition % STATUS_COLORS.length] as string
    const id = await createTag(db, name, color, nextPosition)
    await assignTag(db, taskId, id)
    setNewName("")
  }

  return (
    <>
      <Pressable testID="tag-picker" onPress={() => setOpen(true)} style={styles.pickerBtn}>
        <Text style={styles.pickerBtnText}>+ Tags</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            {allTags.length === 0 ? (
              <Text style={styles.empty}>No tags yet — create one below.</Text>
            ) : (
              allTags.map((t) => (
                <Pressable key={t.id} onPress={() => toggle(t.id)} style={styles.menuRow}>
                  <Text style={styles.check}>{assignedIds.has(t.id) ? "✓" : "  "}</Text>
                  <View style={[styles.dot, { backgroundColor: statusHex(t.color, scheme) }]} />
                  <Text style={styles.menuText} numberOfLines={1}>
                    {t.name}
                  </Text>
                </Pressable>
              ))
            )}
            <View style={styles.createRow}>
              <TextInput
                testID="new-tag-input"
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={() => void createAndAssign()}
                placeholder="New tag…"
                placeholderTextColor={colors.textFaint}
                style={styles.createInput}
              />
              <Pressable
                testID="new-tag-btn"
                onPress={() => void createAndAssign()}
                disabled={!newName.trim()}
                style={styles.createBtn}
              >
                <Text style={styles.createBtnText}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
    chip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    chipText: { color: "#fff", fontSize: 11, fontWeight: "600", maxWidth: 140 },
    extra: { color: c.textMuted, fontSize: 11 },
    pickerBtn: {
      alignSelf: "flex-start",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    pickerBtnText: { color: c.textSecondary, fontSize: 12 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      padding: 32,
    },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 12,
      gap: 10,
    },
    editInput: {
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surfaceInput,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: c.textPrimary,
      fontSize: 15,
    },
    swatchRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    swatch: { width: 26, height: 26, borderRadius: 13 },
    swatchSel: { borderWidth: 2, borderColor: c.textPrimary },
    remove: { color: c.dangerText, fontSize: 13, paddingTop: 2 },
    empty: { color: c.textSecondary, fontSize: 13 },
    menuRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    check: { color: c.primary, fontSize: 14, width: 16 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    menuText: { color: c.textPrimary, fontSize: 15, flexShrink: 1 },
    createRow: {
      flexDirection: "row",
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 10,
    },
    createInput: {
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
    createBtn: {
      backgroundColor: c.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      justifyContent: "center",
    },
    createBtnText: { color: c.onPrimary, fontWeight: "600", fontSize: 14 },
  })
