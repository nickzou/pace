import { useMemo } from "react"
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { TagChips } from "../../tags/tag-control"
import { type Palette, useTheme, useThemedStyles } from "../../theme"
import { dueDayState, formatDate } from "../dates"
import { statusHex } from "../status-control"
import type { ListTask, TaskViewProps } from "./types"

// Board view (P2-07 · mobile). Horizontally-scrolling columns = the DEFAULT status group's statuses,
// left→right open → in-progress → done. Cards are tap-to-open (status/dates edit in the detail
// modal); no drag on native for v1 (decision).
const CATEGORY_RANK: Record<string, number> = { open: 0, in_progress: 1, done: 2 }

export default function BoardView({
  tasks,
  statusesByGroup,
  allStatuses,
  tagsByTask,
  defaultStatusId,
  onOpen,
}: TaskViewProps) {
  const { scheme } = useTheme()
  const styles = useThemedStyles(makeStyles)

  const defaultGroupId = allStatuses.find((s) => s.id === defaultStatusId)?.group_id
  const columns = useMemo(() => {
    const group = defaultGroupId ? (statusesByGroup.get(defaultGroupId) ?? []) : []
    return [...group].sort(
      (a, b) => (CATEGORY_RANK[a.category] ?? 9) - (CATEGORY_RANK[b.category] ?? 9),
    )
  }, [defaultGroupId, statusesByGroup])

  const byStatus = useMemo(() => {
    const map = new Map<string, ListTask[]>()
    for (const c of columns) map.set(c.id, [])
    for (const t of tasks) map.get(t.status_id)?.push(t)
    return map
  }, [columns, tasks])

  if (columns.length === 0) {
    return <Text style={styles.empty}>No board columns to show.</Text>
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {columns.map((col) => {
        const items = byStatus.get(col.id) ?? []
        return (
          <View key={col.id} style={styles.column} testID={`board-column-${col.id}`}>
            <View style={styles.colHeader}>
              <View style={[styles.colDot, { backgroundColor: statusHex(col.color, scheme) }]} />
              <Text style={styles.colName} numberOfLines={1}>
                {col.name}
              </Text>
              <Text style={styles.colCount}>{items.length}</Text>
            </View>
            {items.length === 0 ? (
              <Text style={styles.colEmpty}>—</Text>
            ) : (
              items.map((t) => {
                const state = dueDayState(t.due_date, t.status_category === "done")
                const tags = tagsByTask.get(t.id) ?? []
                return (
                  <Pressable
                    key={t.id}
                    testID={`board-card-${t.id}`}
                    onPress={() => onOpen(t.id)}
                    style={styles.card}
                  >
                    <Text
                      style={[styles.cardTitle, t.status_category === "done" ? styles.done : null]}
                      numberOfLines={2}
                    >
                      {t.parent_id ? "↳ " : ""}
                      {t.title}
                    </Text>
                    {t.child_count > 0 ? (
                      <Text style={styles.badge}>
                        {t.done_count}/{t.child_count} subtasks
                      </Text>
                    ) : null}
                    {tags.length > 0 ? (
                      <View style={styles.cardTags}>
                        <TagChips tags={tags} taskId={t.id} max={3} />
                      </View>
                    ) : null}
                    {t.due_date ? (
                      <Text
                        style={[
                          styles.cardDue,
                          state === "overdue"
                            ? styles.dueOverdue
                            : state === "today"
                              ? styles.dueToday
                              : null,
                        ]}
                        numberOfLines={1}
                      >
                        {state === "overdue" ? "Overdue · " : "Due "}
                        {formatDate(t.due_date, !!t.due_has_time)}
                      </Text>
                    ) : null}
                  </Pressable>
                )
              })
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: { gap: 12, paddingBottom: 8, paddingRight: 8 },
    empty: { color: c.textFaint, fontSize: 13, marginTop: 12 },
    column: {
      width: 260,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 10,
      gap: 8,
    },
    colHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    colDot: { width: 10, height: 10, borderRadius: 5 },
    colName: { flex: 1, color: c.textPrimary, fontSize: 14, fontWeight: "600" },
    colCount: { color: c.textMuted, fontSize: 12 },
    colEmpty: { color: c.textFaint, fontSize: 13, paddingVertical: 8, textAlign: "center" },
    card: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surfaceInput,
      borderRadius: 10,
      padding: 10,
      gap: 6,
    },
    cardTitle: { color: c.textPrimary, fontSize: 14 },
    done: { color: c.textMuted, textDecorationLine: "line-through" },
    badge: { color: c.textMuted, fontSize: 11 },
    cardTags: { marginTop: 2 },
    cardDue: { color: c.textMuted, fontSize: 12 },
    dueOverdue: { color: c.dangerText },
    dueToday: { color: c.warning },
  })
