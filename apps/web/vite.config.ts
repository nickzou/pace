import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"

import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

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
  ],
})

export default config
