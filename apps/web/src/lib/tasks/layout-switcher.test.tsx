// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LAYOUTS } from "./filter"
import { LayoutSwitcher } from "./layout-switcher"

// The switcher is a pure URL-param setter — a tab per layout, the current one selected, and a
// callback with the picked layout. No providers needed.
describe("LayoutSwitcher", () => {
  it("renders a tab per layout and marks the current one selected", () => {
    render(<LayoutSwitcher current="table" onChange={() => {}} />)
    expect(screen.getAllByRole("tab")).toHaveLength(LAYOUTS.length)
    expect(screen.getByRole("tab", { name: "Table" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "false")
  })

  it("calls onChange with the picked layout", () => {
    const onChange = vi.fn()
    render(<LayoutSwitcher current="list" onChange={onChange} />)
    fireEvent.click(screen.getByRole("tab", { name: "Board" }))
    expect(onChange).toHaveBeenCalledWith("board")
  })
})
