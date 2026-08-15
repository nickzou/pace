import { defineConfig } from "vitest/config"

// Standalone config for pure unit tests (the helpers under test import nothing
// React Native-specific, so they run fine under a plain node environment).
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
