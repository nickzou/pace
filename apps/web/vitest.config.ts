import { defineConfig } from "vitest/config"

// Standalone config for pure unit tests (the helpers under test import nothing
// app-specific, so there's no need to pull in the Vite/TanStack Start pipeline).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
