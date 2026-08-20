import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import wasm from "vite-plugin-wasm"

// The desktop (Tauri) build sets PACE_DESKTOP=1 to emit a static SPA shell
// (Tauri loads static files, not an SSR server). The plain web build stays SSR
// for the deployed site — same codebase, two build modes (the hybrid pattern).
const isDesktop = process.env.PACE_DESKTOP === "1"

const config = defineConfig({
  // Load env (only VITE_* reaches the client) from the repo-root .env, the
  // single source of truth shared with apps/api and docker-compose.
  envDir: "../..",
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart({ spa: { enabled: isDesktop } }),
    viteReact(),
    // PowerSync's local SQLite is wa-sqlite (WASM + web workers). vite-plugin-wasm
    // lets those modules load; the worker must be an ES module.
    wasm(),
  ],
  worker: { format: "es" },
  // Don't pre-bundle these — they ship WASM + web-worker assets that Vite's
  // optimizer mangles. (PowerSync M11.)
  optimizeDeps: { exclude: ["@powersync/web", "@journeyapps/wa-sqlite"] },
})

export default config
