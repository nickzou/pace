// Registers jest-dom's matchers (toBeInTheDocument, toHaveTextContent, …) on
// vitest's expect, and unmounts any @testing-library/react trees after each test.
// This runs for every test file; the pure-logic ones run under the `node` env where
// there's no DOM, so cleanup() is guarded to a no-op there.
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  if (typeof document !== "undefined") cleanup()
})
