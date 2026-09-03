import { describe, expect, it } from "vitest"
import { taskUpdateActivities } from "./activity-log"

// The shared diff that turns a task update into activity rows (P3-08). Pure — no DB.
const prev = {
  title: "Old title",
  description: "old notes",
  start_date: "2026-09-01T09:00:00.000Z",
  due_date: "2026-09-02T17:00:00.000Z",
}

describe("taskUpdateActivities", () => {
  it("emits nothing when a field is re-set to its current value (no-op)", () => {
    expect(taskUpdateActivities("t1", prev, { title: "Old title" })).toEqual([])
    expect(taskUpdateActivities("t1", prev, { due_date: prev.due_date })).toEqual([])
  })

  it("emits nothing for fields not present in the update", () => {
    expect(taskUpdateActivities("t1", prev, {})).toEqual([])
  })

  it("records a title change with from/to", () => {
    expect(taskUpdateActivities("t1", prev, { title: "New title" })).toEqual([
      {
        taskId: "t1",
        action: "title_changed",
        field: "title",
        fromValue: "Old title",
        toValue: "New title",
      },
    ])
  })

  it("records a description change without leaking the body text", () => {
    const rows = taskUpdateActivities("t1", prev, { description: "brand new notes" })
    expect(rows).toEqual([{ taskId: "t1", action: "description_changed", field: "description" }])
  })

  it("splits a start/due move into distinct start_changed and due_changed rows", () => {
    const rows = taskUpdateActivities("t1", prev, {
      start_date: "2026-09-05T09:00:00.000Z",
      due_date: "2026-09-06T17:00:00.000Z",
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.action)).toEqual(["start_changed", "due_changed"])
    expect(rows[1]).toMatchObject({
      action: "due_changed",
      field: "due_date",
      fromValue: prev.due_date,
      toValue: "2026-09-06T17:00:00.000Z",
    })
  })

  it("records clearing a date as a change to null", () => {
    expect(taskUpdateActivities("t1", prev, { due_date: null })).toEqual([
      {
        taskId: "t1",
        action: "due_changed",
        field: "due_date",
        fromValue: prev.due_date,
        toValue: null,
      },
    ])
  })
})
