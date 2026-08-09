import { describe, expect, it } from "vitest"
import { newTaskSchema, taskSchema, updateTaskSchema } from "./task"

const UUID = "11111111-1111-4111-8111-111111111111"
const iso = () => new Date().toISOString()
const validTask = () => ({
  id: UUID,
  title: "x",
  createdAt: iso(),
  updatedAt: iso(),
  deletedAt: null,
})

describe("taskSchema", () => {
  it("applies defaults for description and completed", () => {
    const t = taskSchema.parse(validTask())
    expect(t.description).toBe("")
    expect(t.completed).toBe(false)
  })

  it("rejects an empty title and a non-uuid id", () => {
    expect(taskSchema.safeParse({ ...validTask(), title: "" }).success).toBe(false)
    expect(taskSchema.safeParse({ ...validTask(), id: "nope" }).success).toBe(false)
  })
})

describe("newTaskSchema", () => {
  it("needs only a title — the rest default", () => {
    expect(newTaskSchema.parse({ title: "x" })).toEqual({
      title: "x",
      description: "",
      completed: false,
    })
  })
})

describe("updateTaskSchema", () => {
  it("leaves omitted fields undefined — an update never blanks what you didn't send", () => {
    const u = updateTaskSchema.parse({ id: UUID, completed: true })
    expect(u.description).toBeUndefined()
    expect(u.completed).toBe(true)
  })
})
