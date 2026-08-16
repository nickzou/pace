// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ToastProvider, useToast } from "./toast"

// An exemplar component test (jsdom + @testing-library/react): it renders the real
// provider and drives it through its public hook, exactly like a real component —
// no mocks, no server. This is the middle tier between the pure-logic unit tests
// and the full-stack e2e: fast, and able to hit paths e2e can't easily reach (the
// auto-dismiss timer, the action-then-dismiss sequence).
type Action = { label: string; onClick: () => void }

// A tiny consumer so a test can fire toasts imperatively, the way real code does.
function ShowButton({ message, action }: { message: string; action?: Action }) {
  const { show } = useToast()
  return (
    <button type="button" onClick={() => show(message, action)}>
      show
    </button>
  )
}

function setup(message: string, action?: Action) {
  render(
    <ToastProvider>
      <ShowButton message={message} action={action} />
    </ToastProvider>,
  )
  return () => fireEvent.click(screen.getByRole("button", { name: "show" }))
}

describe("ToastProvider", () => {
  // Fake timers so the 5s auto-dismiss is deterministic and instant.
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("renders nothing until show() is called, then shows the message", () => {
    const show = setup("Saved")
    expect(screen.queryByText("Saved")).not.toBeInTheDocument()
    show()
    expect(screen.getByText("Saved")).toBeInTheDocument()
  })

  it("auto-dismisses after 5s", () => {
    const show = setup("Saved")
    show()
    expect(screen.getByText("Saved")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText("Saved")).not.toBeInTheDocument()
  })

  it("does not dismiss early", () => {
    const show = setup("Saved")
    show()
    act(() => vi.advanceTimersByTime(4999))
    expect(screen.getByText("Saved")).toBeInTheDocument()
  })

  it("an action fires its onClick and dismisses the toast", () => {
    const onClick = vi.fn()
    const show = setup("Task deleted", { label: "Undo", onClick })
    show()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByText("Task deleted")).not.toBeInTheDocument()
  })
})
