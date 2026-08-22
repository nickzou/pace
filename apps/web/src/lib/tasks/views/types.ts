import type { TagOption } from "../../tags/tag-control"
import type { Task } from "../mutations"
import type { StatusOption } from "../status-control"

// A task joined with its status (P2-03) — the category drives done-ness; colour + name drive the
// status control. Shared by the route and every Multiview view (P2-07).
export type ListTask = Task & {
  status_name: string
  status_color: string
  status_category: string
  status_group_id: string
  // Subtask roll-up (P2-05): direct-child counts, for the progress badge.
  child_count: number
  done_count: number
  // Recurrence (P2-08): the stored rule, or null — drives the calendar's ghost occurrences.
  recurrence: string | null
}

// The already-derived data every view renders. Computed ONCE in the route and handed to whichever
// view is active — the single source of truth that makes a layout switch a component swap, not a
// data cycle (P2-07 §6). Views call usePowerSync() themselves for writes.
export type TaskViewProps = {
  tasks: ListTask[] // the filtered/visible set
  allStatuses: (StatusOption & { group_id: string })[]
  statusesByGroup: Map<string, StatusOption[]>
  tagsByTask: Map<string, TagOption[]>
  allTags: TagOption[]
  defaultStatusId?: string
  onOpen: (id: string) => void
}
