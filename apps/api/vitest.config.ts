import { defineConfig } from "vitest/config"

// Integration tests: run the tRPC router against a real Postgres (pace_test).
//   - global-setup.ts creates + migrates that DB once.
//   - setup.ts points the db at pace_test and guards against the dev DB.
// Serial (fileParallelism: false) because the tests share one database and
// truncate between cases.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
  },
})
