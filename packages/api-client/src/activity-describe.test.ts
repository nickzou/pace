import { describe, expect, it } from "vitest"
import { type ActivityEntry, describeActivity, formatActivityTimestamp } from "./activity-describe"

// A row as it comes off local SQLite (meta is a JSON string). Fixed tz so date output is
// deterministic regardless of where the test runs.
const TZ = "UTC"
function entry(over: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: "a1",
    action: "created",
    field: null,
    from_value: null,
    to_value: null,
    meta: null,
    created_at: "2026-09-03T12:00:00.000Z",
    ...over,
  }
}

describe("describeActivity", () => {
  it("describes creation, deletion and restoration", () => {
    expect(describeActivity(entry({ action: "created" }), TZ)).toBe("Created this task")
    expect(describeActivity(entry({ action: "deleted" }), TZ)).toBe("Deleted this task")
    expect(describeActivity(entry({ action: "restored" }), TZ)).toBe("Restored this task")
  })

  it("quotes the new title and hides description body", () => {
    expect(describeActivity(entry({ action: "title_changed", to_value: "Ship it" }), TZ)).toBe(
      'Renamed to "Ship it"',
    )
    expect(describeActivity(entry({ action: "description_changed" }), TZ)).toBe(
      "Edited the description",
    )
  })

  it("reads status labels from the meta snapshot and flags done / reopen", () => {
    const done = entry({
      action: "status_changed",
      to_value: "s2",
      meta: JSON.stringify({ toStatus: { name: "Done", color: "green", category: "done" } }),
    })
    expect(describeActivity(done, TZ)).toBe("Marked done — Done")

    const reopened = entry({
      action: "status_changed",
      meta: JSON.stringify({
        fromStatus: { name: "Done", color: "green", category: "done" },
        toStatus: { name: "To Do", color: "slate", category: "open" },
      }),
    })
    expect(describeActivity(reopened, TZ)).toBe("Reopened — To Do")

    const moved = entry({
      action: "status_changed",
      meta: JSON.stringify({
        toStatus: { name: "Doing", color: "amber", category: "in_progress" },
      }),
    })
    expect(describeActivity(moved, TZ)).toBe("Changed status to Doing")
  })

  it("renders due/start reschedules in the given timezone, and clears", () => {
    const due = entry({
      action: "due_changed",
      from_value: "2026-09-01T00:00:00.000Z",
      to_value: "2026-09-03T00:00:00.000Z",
    })
    expect(describeActivity(due, TZ)).toBe("Rescheduled the due date to Sep 3, 2026")

    const setStart = entry({ action: "start_changed", to_value: "2026-09-03T00:00:00.000Z" })
    expect(describeActivity(setStart, TZ)).toBe("Set the start date to Sep 3, 2026")

    const cleared = entry({
      action: "due_changed",
      from_value: "2026-09-01T00:00:00.000Z",
      to_value: null,
    })
    expect(describeActivity(cleared, TZ)).toBe("Cleared the due date")
  })

  it("describes reparent and tag changes from meta", () => {
    const under = entry({
      action: "reparented",
      meta: JSON.stringify({ toParentTitle: "Project X" }),
    })
    expect(describeActivity(under, TZ)).toBe('Moved under "Project X"')
    expect(describeActivity(entry({ action: "reparented", meta: null }), TZ)).toBe(
      "Moved to top level",
    )

    const added = entry({
      action: "tags_changed",
      field: "added",
      meta: JSON.stringify({ tag: { name: "Urgent", color: "red" } }),
    })
    expect(describeActivity(added, TZ)).toBe("Added tag Urgent")
    const removed = entry({
      action: "tags_changed",
      field: "removed",
      meta: JSON.stringify({ tag: { name: "Urgent", color: "red" } }),
    })
    expect(describeActivity(removed, TZ)).toBe("Removed tag Urgent")
  })

  it("survives malformed meta without throwing", () => {
    const bad = entry({ action: "status_changed", to_value: "s9", meta: "{not json" })
    expect(describeActivity(bad, TZ)).toBe("Changed status to s9")
  })
})

describe("formatActivityTimestamp", () => {
  it("formats a date + time in the given timezone", () => {
    // 18:58 UTC is 14:58 in New York (EDT, -4).
    const iso = "2026-09-03T18:58:00.000Z"
    expect(formatActivityTimestamp(iso, "America/New_York")).toBe("Sep 3 at 2:58 PM")
    expect(formatActivityTimestamp(iso, "UTC")).toBe("Sep 3 at 6:58 PM")
  })
})
