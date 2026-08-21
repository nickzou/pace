import type { TagOption } from "../../tags/tag-control"
import type { Task } from "../mutations"
import type { StatusOption } from "../status-control"

// A task joined with its status (P2-03) — the category drives done-ness; colour + name drive the
// status control. Shared by the home screen and every Multiview view (P2-07).
export type ListTask = Task & {
  status_name: string
  status_color: string
  status_category: string
  status_group_id: string
  // Subtask roll-up (P2-05): counts of this task's direct children, for the progress badge.
  child_count: number
  done_count: number
}

// The already-derived data every view renders. Computed once on the home screen and handed to
// whichever view is active — the single source of truth that makes a layout switch a component
// swap (mirrors apps/web's TaskViewProps, minus the URL bits native doesn't have).
export type TaskViewProps = {
  tasks: ListTask[] // the filtered/visible set
  statusesByGroup: Map<string, StatusOption[]>
  allStatuses: (StatusOption & { group_id: string })[]
  tagsByTask: Map<string, TagOption[]>
  defaultStatusId?: string
  onOpen: (id: string) => void
}
