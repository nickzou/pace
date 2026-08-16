import { defineConfig } from "vitest/config"

// Default env is `node` — the pure-logic tests (dates, token/theme parity, the
// class-usage guard) don't need a DOM and stay fast. Component/hook tests opt into
// a DOM per-file with a `// @vitest-environment jsdom` docblock (see toast.test.tsx)
// and render via @testing-library/react. setupFiles registers jest-dom matchers and
// unmounts trees after each test (a no-op in the node tests — see vitest.setup.ts).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
})
