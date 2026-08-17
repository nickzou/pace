import { describe, expect, it } from "vitest"
import { newTaskSchema, taskSchema, updateTaskSchema } from "./task"

const UUID = "11111111-1111-4111-8111-111111111111"
const STATUS = "22222222-2222-4222-8222-222222222222"
const iso = () => new Date().toISOString()
const validTask = () => ({
  id: UUID,
  title: "x",
  statusId: STATUS,
  resolvedAt: null,
  startDate: null,
  dueDate: null,
  createdAt: iso(),
  updatedAt: iso(),
  deletedAt: null,
})

describe("taskSchema", () => {
  it("defaults description and the hasTime flags, and requires a statusId", () => {
    const t = taskSchema.parse(validTask())
    expect(t.description).toBe("")
    expect(t.statusId).toBe(STATUS)
    expect(t.startHasTime).toBe(false)
    expect(t.dueHasTime).toBe(false)
    // statusId is required — no default.
    expect(taskSchema.safeParse({ ...validTask(), statusId: undefined }).success).toBe(false)
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
  it("needs only a title; statusId is optional (server fills the default)", () => {
    const t = newTaskSchema.parse({ title: "x" })
    expect(t.title).toBe("x")
    expect(t.description).toBe("")
    expect(t.statusId).toBeUndefined()
  })

  it("accepts a client-supplied statusId", () => {
    expect(newTaskSchema.parse({ title: "x", statusId: STATUS }).statusId).toBe(STATUS)
  })
})

describe("updateTaskSchema", () => {
  it("leaves omitted fields undefined — an update never blanks what you didn't send", () => {
    const u = updateTaskSchema.parse({ id: UUID, statusId: STATUS })
    expect(u.description).toBeUndefined()
    expect(u.statusId).toBe(STATUS)
  })

  it("distinguishes clearing a date (null) from leaving it untouched (omitted)", () => {
    expect(updateTaskSchema.parse({ id: UUID, dueDate: null }).dueDate).toBeNull()
    expect(updateTaskSchema.parse({ id: UUID }).dueDate).toBeUndefined()
  })
})
