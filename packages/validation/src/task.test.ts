import { describe, expect, it } from "vitest"
import {
  newTaskSchema,
  setParentSchema,
  setRecurrenceSchema,
  taskSchema,
  updateTaskSchema,
} from "./task"

const UUID = "11111111-1111-4111-8111-111111111111"
const STATUS = "22222222-2222-4222-8222-222222222222"
const PARENT = "33333333-3333-4333-8333-333333333333"
const iso = () => new Date().toISOString()
const validTask = () => ({
  id: UUID,
  title: "x",
  statusId: STATUS,
  resolvedAt: null,
  startDate: null,
  dueDate: null,
  parentId: null,
  sortOrder: "a0",
  recurrence: null,
  recurrenceRegen: null,
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

  it("carries parentId (P2-05): null for top-level, a uuid for a subtask; rejects garbage", () => {
    expect(taskSchema.parse({ ...validTask(), parentId: null }).parentId).toBeNull()
    expect(taskSchema.parse({ ...validTask(), parentId: PARENT }).parentId).toBe(PARENT)
    expect(taskSchema.safeParse({ ...validTask(), parentId: "nope" }).success).toBe(false)
  })

  it("requires a string sortOrder (P2-06): the fractional key is not optional on a full task", () => {
    expect(taskSchema.parse({ ...validTask(), sortOrder: "Zz" }).sortOrder).toBe("Zz")
    expect(taskSchema.safeParse({ ...validTask(), sortOrder: undefined }).success).toBe(false)
    expect(taskSchema.safeParse({ ...validTask(), sortOrder: 5 }).success).toBe(false)
  })

  it("carries recurrence (P2-08): a nullable RRULE string + an 'advance'|'duplicate' regen mode", () => {
    expect(taskSchema.parse(validTask()).recurrence).toBeNull()
    const r = taskSchema.parse({
      ...validTask(),
      recurrence: "FREQ=WEEKLY;INTERVAL=2",
      recurrenceRegen: "advance",
    })
    expect(r.recurrence).toBe("FREQ=WEEKLY;INTERVAL=2")
    expect(r.recurrenceRegen).toBe("advance")
    // regen is one of the two modes (or null) — never arbitrary text.
    expect(taskSchema.safeParse({ ...validTask(), recurrenceRegen: "sometimes" }).success).toBe(
      false,
    )
    // both keys are required (nullable, like the other schedule fields).
    expect(taskSchema.safeParse({ ...validTask(), recurrence: undefined }).success).toBe(false)
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

  it("takes an optional parentId to mint a subtask (omitted = top-level)", () => {
    expect(newTaskSchema.parse({ title: "x" }).parentId).toBeUndefined()
    expect(newTaskSchema.parse({ title: "x", parentId: PARENT }).parentId).toBe(PARENT)
    expect(newTaskSchema.safeParse({ title: "x", parentId: "nope" }).success).toBe(false)
  })

  it("takes an optional sortOrder (P2-06): omitted = server assigns a bottom-of-scope key", () => {
    expect(newTaskSchema.parse({ title: "x" }).sortOrder).toBeUndefined()
    expect(newTaskSchema.parse({ title: "x", sortOrder: "a0" }).sortOrder).toBe("a0")
  })
})

describe("setParentSchema", () => {
  it("moves under a uuid parent or promotes to top-level with null", () => {
    expect(setParentSchema.parse({ id: UUID, parentId: PARENT }).parentId).toBe(PARENT)
    expect(setParentSchema.parse({ id: UUID, parentId: null }).parentId).toBeNull()
  })

  it("requires an id and a present parentId field (null or uuid, not omitted/garbage)", () => {
    expect(setParentSchema.safeParse({ parentId: PARENT }).success).toBe(false)
    expect(setParentSchema.safeParse({ id: UUID }).success).toBe(false)
    expect(setParentSchema.safeParse({ id: UUID, parentId: "nope" }).success).toBe(false)
  })
})

describe("setRecurrenceSchema", () => {
  it("sets a rule + regen mode, or clears both with nulls", () => {
    const s = setRecurrenceSchema.parse({
      id: UUID,
      recurrence: "FREQ=DAILY",
      recurrenceRegen: "duplicate",
    })
    expect(s.recurrence).toBe("FREQ=DAILY")
    expect(s.recurrenceRegen).toBe("duplicate")
    expect(
      setRecurrenceSchema.parse({ id: UUID, recurrence: null, recurrenceRegen: null }).recurrence,
    ).toBeNull()
  })

  it("requires id + both fields present, and a valid regen mode", () => {
    expect(setRecurrenceSchema.safeParse({ recurrence: null, recurrenceRegen: null }).success).toBe(
      false,
    )
    expect(
      setRecurrenceSchema.safeParse({ id: UUID, recurrence: "FREQ=DAILY", recurrenceRegen: "nope" })
        .success,
    ).toBe(false)
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

  it("carries an optional sortOrder (P2-06): a reorder is just an update of the key", () => {
    expect(updateTaskSchema.parse({ id: UUID, sortOrder: "a0V" }).sortOrder).toBe("a0V")
    expect(updateTaskSchema.parse({ id: UUID }).sortOrder).toBeUndefined()
  })
})
