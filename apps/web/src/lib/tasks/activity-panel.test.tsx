// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ActivityPanel } from "./activity-panel"

// Drive the panel from a controllable fake of the two local-SQLite reads it makes: the user's
// timezone and the task's activity rows (sliced by the LIMIT param so "Show more" is exercised).
// describeActivity is NOT mocked — the humanised text is asserted for real.
const state = vi.hoisted(() => ({ entries: [] as Record<string, unknown>[], tz: "UTC" }))

vi.mock("@powersync/react", () => ({
  useQuery: (sql: string, params?: unknown[]) => {
    if (sql.includes("user_settings")) return { data: [{ timezone: state.tz }] }
    if (sql.includes("task_activity")) {
      const limit = Number(params?.[1] ?? 20)
      return { data: state.entries.slice(0, limit) }
    }
    return { data: [] }
  },
}))

function row(over: Record<string, unknown>) {
  return {
    id: "a",
    action: "created",
    field: null,
    from_value: null,
    to_value: null,
    meta: null,
    created_at: "2026-09-03T12:00:00.000Z",
    ...over,
  }
}

beforeEach(() => {
  state.entries = []
  state.tz = "UTC"
})

describe("ActivityPanel", () => {
  it("shows the empty state when there's no activity", () => {
    render(<ActivityPanel taskId="t1" />)
    expect(screen.getByText("No activity yet")).toBeTruthy()
  })

  it("renders humanised entries (non-collapsible, open by default)", () => {
    state.entries = [
      row({ id: "a1", action: "created" }),
      row({
        id: "a2",
        action: "due_changed",
        from_value: "2026-09-02T00:00:00.000Z",
        to_value: "2026-09-05T00:00:00.000Z",
      }),
    ]
    render(<ActivityPanel taskId="t1" />)
    expect(screen.getByText("Created this task")).toBeTruthy()
    expect(screen.getByText("Rescheduled the due date to Sep 5, 2026")).toBeTruthy()
  })

  it("collapses by default and reveals the list on toggle", () => {
    state.entries = [row({ id: "a1", action: "created" })]
    render(<ActivityPanel taskId="t1" collapsible />)
    // Closed: the entry isn't rendered yet.
    expect(screen.queryByText("Created this task")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /activity/i }))
    expect(screen.getByText("Created this task")).toBeTruthy()
  })

  it("pages with Show more until the feed is exhausted", () => {
    // 21 rows: the first page shows 20 and offers "Show more"; a click reveals the 21st.
    state.entries = Array.from({ length: 21 }, (_, i) =>
      row({ id: `a${i}`, action: "title_changed", to_value: `t${i}` }),
    )
    render(<ActivityPanel taskId="t1" />)
    expect(screen.queryByText('Renamed to "t20"')).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    expect(screen.getByText('Renamed to "t20"')).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })
})
