// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ViewSettings } from "./view-settings"

// The settings modal is a controlled wrapper: it reflects the showSubtasks prop and reports
// changes. The default-off behaviour is the caller's; here we verify the checkbox mirrors state.
const open = () => fireEvent.click(screen.getByRole("button", { name: "View settings" }))

describe("ViewSettings", () => {
  it("shows the checkbox unchecked when subtasks are off", () => {
    render(<ViewSettings showSubtasks={false} onShowSubtasksChange={() => {}} />)
    open()
    expect(screen.getByRole("checkbox", { name: /show subtasks/i })).not.toBeChecked()
  })

  it("shows it checked when subtasks are on", () => {
    render(<ViewSettings showSubtasks={true} onShowSubtasksChange={() => {}} />)
    open()
    expect(screen.getByRole("checkbox", { name: /show subtasks/i })).toBeChecked()
  })

  it("reports a toggle to the caller", () => {
    const onChange = vi.fn()
    render(<ViewSettings showSubtasks={false} onShowSubtasksChange={onChange} />)
    open()
    fireEvent.click(screen.getByRole("checkbox", { name: /show subtasks/i }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
