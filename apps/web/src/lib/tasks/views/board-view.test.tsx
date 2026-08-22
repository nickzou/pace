// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import BoardView from "./board-view"
import type { ListTask } from "./types"

// Board rendering wiring (the ordering/clamp rules are unit-tested in board-logic.test). We mock
// the two hooks the view and its controls reach for, so it renders from props alone.
vi.mock("@powersync/react", () => ({
  usePowerSync: () => ({ execute: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock("#/lib/theme", () => ({ useTheme: () => ({ theme: "dark" as const }) }))

const statuses = [
  { id: "todo", name: "To Do", color: "blue", category: "open" },
  { id: "doing", name: "Doing", color: "amber", category: "in_progress" },
  { id: "done", name: "Done", color: "green", category: "done" },
]

const task = (over: Partial<ListTask>): ListTask => ({
  id: "t",
  title: "Task",
  description: "",
  status_id: "todo",
  resolved_at: null,
  start_date: null,
  due_date: null,
  start_has_time: 0,
  due_has_time: 0,
  parent_id: null,
  sort_order: "a0",
  created_at: "",
  updated_at: "",
  status_name: "To Do",
  status_color: "blue",
  status_category: "open",
  status_group_id: "g1",
  child_count: 0,
  done_count: 0,
  recurrence: null,
  ...over,
})

function renderBoard(tasks: ListTask[]) {
  render(
    <BoardView
      tasks={tasks}
      allStatuses={statuses.map((s) => ({ ...s, group_id: "g1" }))}
      statusesByGroup={new Map([["g1", statuses]])}
      tagsByTask={new Map()}
      allTags={[]}
      defaultStatusId="todo"
      onOpen={() => {}}
    />,
  )
}

describe("BoardView", () => {
  it("renders a column per default-group status", () => {
    renderBoard([task({ id: "a", title: "Alpha" })])
    for (const name of ["To Do", "Doing", "Done"]) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getByText("Alpha")).toBeInTheDocument()
  })

  it("marks a surfaced subtask card with the subtask glyph", () => {
    renderBoard([
      task({ id: "a", title: "Parent" }),
      task({ id: "b", title: "Child", status_id: "doing", parent_id: "a" }),
    ])
    expect(screen.getByText("Child")).toBeInTheDocument()
    // Exactly one card is a subtask, so exactly one ↳ marker.
    expect(screen.getAllByLabelText("Subtask")).toHaveLength(1)
  })

  it("shows the child roll-up badge on a parent card", () => {
    renderBoard([task({ id: "a", title: "Parent", child_count: 3, done_count: 1 })])
    expect(screen.getByText("1/3")).toBeInTheDocument()
  })
})
