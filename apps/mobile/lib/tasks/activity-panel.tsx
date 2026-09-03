import { type ActivityEntry, describeActivity, formatActivityTimestamp } from "@pace/api-client"
import { useQuery } from "@powersync/react"
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { type Palette, useThemedStyles } from "../theme"

// How many entries to load per page; "Show more" pulls the next page.
const PAGE = 20

// Task activity history (P3-08) — the mobile twin of web's ActivityPanel. Reads the task's
// append-only feed live from local SQLite, newest-first, and renders each entry as a humanised
// line + a timestamp in the user's zone (the humanizer is shared with web via @pace/api-client).
// Mobile is always the narrow layout, so it's a collapsible section that defaults closed.
export function ActivityPanel({ taskId }: { taskId: string }) {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(PAGE)

  // The user's timezone (P2-08) for date formatting; fall back to the device zone.
  const { data: settings } = useQuery<{ timezone: string | null }>(
    "SELECT timezone FROM user_settings LIMIT 1",
  )
  const tz = settings[0]?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  const { data: entries } = useQuery<ActivityEntry>(
    `SELECT id, action, field, from_value, to_value, meta, created_at
       FROM task_activity WHERE task_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ?`,
    [taskId, limit],
  )
  const hasMore = entries.length === limit

  return (
    <View style={styles.card}>
      <Pressable
        testID="activity-toggle"
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
        hitSlop={6}
      >
        <Text style={styles.heading}>ACTIVITY</Text>
        <Text style={styles.chevron}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open ? (
        entries.length === 0 ? (
          <Text style={styles.empty}>No activity yet</Text>
        ) : (
          <View style={styles.list}>
            {entries.map((e) => (
              <View key={e.id} style={styles.row}>
                <View style={styles.dot} />
                <View style={styles.rowBody}>
                  <Text style={styles.text}>{describeActivity(e, tz)}</Text>
                  <Text style={styles.time}>{formatActivityTimestamp(e.created_at, tz)}</Text>
                </View>
              </View>
            ))}
            {hasMore ? (
              <Pressable onPress={() => setLimit((l) => l + PAGE)} hitSlop={6}>
                <Text style={styles.more}>Show more</Text>
              </Pressable>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  )
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: { borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, gap: 8 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heading: { color: c.textSecondary, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
    chevron: { color: c.textMuted, fontSize: 14 },
    empty: { color: c.textSecondary, fontSize: 14, paddingVertical: 4 },
    list: { gap: 10 },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.textFaint, marginTop: 6 },
    rowBody: { flex: 1, gap: 2 },
    text: { color: c.textPrimary, fontSize: 14 },
    time: { color: c.textMuted, fontSize: 12 },
    more: { color: c.textMuted, fontSize: 13, fontWeight: "600", paddingVertical: 4 },
  })
