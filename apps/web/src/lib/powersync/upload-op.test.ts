import { type TrpcClient, uploadOp } from "@pace/api-client"
import { UpdateType } from "@powersync/web"
import { describe, expect, it, vi } from "vitest"

// A tRPC client whose procedures are all spies. We cast to TrpcClient and only assert on the
// handful the tests exercise — enough to pin the op → mutation mapping without a real backend.
function mockTrpc() {
  const proc = () => ({ mutate: vi.fn().mockResolvedValue(undefined) })
  return {
    tasks: {
      create: proc(),
      update: proc(),
      setParent: proc(),
      setRecurrence: proc(),
      softDelete: proc(),
    },
  }
}

const run = (trpc: ReturnType<typeof mockTrpc>, type: UpdateType, data: Record<string, unknown>) =>
  uploadOp(trpc as unknown as TrpcClient, "tasks", type, "t1", data)

describe("uploadOp — tasks PATCH", () => {
  // The regression guard: PowerSync's CRUD records only *changed* columns, and every client
  // mutation bumps updated_at — so re-setting a field to its current value yields an op whose only
  // change is updated_at, which maps to no server column. It must NOT be sent: an empty update made
  // the server throw "No values to set" (a non-fatal 500) that retried forever and stalled the queue.
  it("skips an update whose only changed column is updated_at", async () => {
    const trpc = mockTrpc()
    await run(trpc, UpdateType.PATCH, { updated_at: "2026-01-01T00:00:00Z" })
    expect(trpc.tasks.update.mutate).not.toHaveBeenCalled()
  })

  it("sends a real column change through update, mapping snake_case → camelCase", async () => {
    const trpc = mockTrpc()
    await run(trpc, UpdateType.PATCH, {
      due_date: "2026-09-16T03:59:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    })
    expect(trpc.tasks.update.mutate).toHaveBeenCalledWith({
      id: "t1",
      dueDate: "2026-09-16T03:59:00Z",
    })
  })

  it("routes an isolated recurrence write to setRecurrence, not update", async () => {
    const trpc = mockTrpc()
    const rule = "DTSTART:20260915T235900Z\nRRULE:FREQ=WEEKLY"
    await run(trpc, UpdateType.PATCH, {
      recurrence: rule,
      recurrence_regen: "advance",
      updated_at: "2026-01-01T00:00:00Z",
    })
    expect(trpc.tasks.setRecurrence.mutate).toHaveBeenCalledWith({
      id: "t1",
      recurrence: rule,
      recurrenceRegen: "advance",
    })
    expect(trpc.tasks.update.mutate).not.toHaveBeenCalled()
  })

  it("routes an isolated parent write to setParent — null promotes to top-level", async () => {
    const trpc = mockTrpc()
    await run(trpc, UpdateType.PATCH, { parent_id: null, updated_at: "2026-01-01T00:00:00Z" })
    expect(trpc.tasks.setParent.mutate).toHaveBeenCalledWith({ id: "t1", parentId: null })
    expect(trpc.tasks.update.mutate).not.toHaveBeenCalled()
  })
})
