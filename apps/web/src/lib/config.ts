// Runtime configuration for the web app — the API and PowerSync URLs.
//
// These differ per environment (prod, staging, each PR preview). Vite would
// inline VITE_ vars at *build* time, baking one URL into the bundle — so instead
// the SSR server reads them from its runtime env and injects them as
// window.__PACE_CONFIG__ (see routes/__root.tsx). One built image then serves
// every environment; only the container's env vars change.
//
// Resolution order:
//   - SSR (server): process.env.API_URL / POWERSYNC_URL — the container's env
//   - browser, deployed web: window.__PACE_CONFIG__ (injected by the SSR shell)
//   - browser, no injection (desktop/mobile SPA — `tauri build`, no server):
//     the build-time VITE_ vars, exactly as before.

export type PaceConfig = {
  apiUrl: string
  powersyncUrl: string
}

declare global {
  interface Window {
    __PACE_CONFIG__?: PaceConfig
  }
}

const DEFAULT_API_URL = "http://localhost:3001"
const DEFAULT_POWERSYNC_URL = "http://localhost:8080"

// Bracketed access so Vite doesn't statically replace it in the client bundle;
// `process` is undefined in the browser, so guard on it first.
function serverEnv(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env[name] : undefined
}

// Build-time values (inlined by Vite). Only the desktop/mobile SPA fallback.
function buildTimeConfig(): PaceConfig {
  return {
    apiUrl: import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
    powersyncUrl: import.meta.env.VITE_POWERSYNC_URL ?? DEFAULT_POWERSYNC_URL,
  }
}

export function getConfig(): PaceConfig {
  // Server-side render: the container's runtime env wins, else build-time.
  if (typeof window === "undefined") {
    const build = buildTimeConfig()
    return {
      apiUrl: serverEnv("API_URL") ?? build.apiUrl,
      powersyncUrl: serverEnv("POWERSYNC_URL") ?? build.powersyncUrl,
    }
  }
  // Browser: the SSR-injected config if present, else build-time (desktop SPA).
  return window.__PACE_CONFIG__ ?? buildTimeConfig()
}
