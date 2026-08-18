// Which status a task should take when it moves into `groupId`. A task's status list is
// derived from its status_id, so "switch list" means pointing the task at the target
// group's first `open` status (every group keeps ≥1 open), falling back to the group's
// first status of any category. Assumes position-ordered input — the settings/detail
// queries `ORDER BY position`, so array order is display order. Returns undefined only if
// the group has no live statuses, which a caller treats as a no-op.
type GroupStatus = { id: string; group_id: string; category: string }

export function openStatusForGroup<T extends GroupStatus>(
  statuses: readonly T[],
  groupId: string,
): T | undefined {
  return (
    statuses.find((s) => s.group_id === groupId && s.category === "open") ??
    statuses.find((s) => s.group_id === groupId)
  )
}
