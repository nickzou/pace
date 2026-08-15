import { describe, expect, it } from "vitest"
import { newTaskSchema, taskSchema, updateTaskSchema } from "./task"

const UUID = "11111111-1111-4111-8111-111111111111"
const iso = () => new Date().toISOString()
const validTask = () => ({
  id: UUID,
  title: "x",
  startDate: null,
  dueDate: null,
  createdAt: iso(),
  updatedAt: iso(),
  deletedAt: null,
})

describe("taskSchema", () => {
  it("applies defaults for description, completed, and the hasTime flags", () => {
    const t = taskSchema.parse(validTask())
    expect(t.description).toBe("")
    expect(t.completed).toBe(false)
    expect(t.startHasTime).toBe(false)
    expect(t.dueHasTime).toBe(false)
  })

  it("rejects an empty title and a non-uuid id", () => {
    expect(taskSchema.safeParse({ ...validTask(), title: "" }).success).toBe(false)
    expect(taskSchema.safeParse({ ...validTask(), id: "nope" }).success).toBe(false)
  })

  it("accepts nullable start/due datetimes and rejects a non-datetime", () => {
    const t = taskSchema.parse({ ...validTask(), startDate: iso(), dueDate: iso() })
    expect(t.startDate).not.toBeNull()
    expect(t.dueDate).not.toBeNull()
    expect(taskSchema.safeParse({ ...validTask(), dueDate: "not-a-date" }).success).toBe(false)
  })
})

describe("newTaskSchema", () => {
  it("needs only a title — the rest default", () => {
    expect(newTaskSchema.parse({ title: "x" })).toEqual({
      title: "x",
      description: "",
      completed: false,
      startHasTime: false,
      dueHasTime: false,
    })
  })
})

describe("updateTaskSchema", () => {
  it("leaves omitted fields undefined — an update never blanks what you didn't send", () => {
    const u = updateTaskSchema.parse({ id: UUID, completed: true })
    expect(u.description).toBeUndefined()
    expect(u.completed).toBe(true)
  })

  it("distinguishes clearing a date (null) from leaving it untouched (omitted)", () => {
    expect(updateTaskSchema.parse({ id: UUID, dueDate: null }).dueDate).toBeNull()
    expect(updateTaskSchema.parse({ id: UUID }).dueDate).toBeUndefined()
  })
})
